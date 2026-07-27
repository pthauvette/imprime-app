/**
 * POST /api/orders/[id]/cancel-request
 *
 * Customer-initiated demande d'annulation. Pas un cancel automatique
 * (trop risqué — la commande peut déjà être en production chez la
 * presse). On envoie un email à l'admin avec le contexte complet, et
 * l'admin tranche via /admin/orders/[id] dans les minutes/heures qui
 * suivent.
 *
 * Use case : customer clique "Demander l'annulation" sur /orders/[id]
 * (statut PAID, SUBMITTED ou IN_PRODUCTION), entre une raison, submit.
 * Admin reçoit email avec lien direct vers la commande pour agir.
 *
 * Body : { reason: string (1-2000 chars) }
 *
 * Status eligible : PAID, SUBMITTED, IN_PRODUCTION
 * Status REFUSED : PENDING (pas payé), CANCELLED/FAILED (déjà fini),
 *                  SHIPPED/DELIVERED (trop tard, le colis bouge)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { logEmail } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';

const BodySchema = z.object({
  reason: z.string().min(1).max(2000),
});

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

const ELIGIBLE_STATUS = new Set(['PAID', 'SUBMITTED', 'IN_PRODUCTION']);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export const POST = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const order = await prisma.order.findUnique({
    where: { id },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!order) {
    return NextResponse.json({ error: 'Commande introuvable.' }, { status: 404 });
  }

  // Owner check OU admin (admin peut aussi utiliser ce flow pour test)
  const isOwner = order.userId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Commande introuvable.' }, { status: 404 });
  }

  if (!ELIGIBLE_STATUS.has(order.status)) {
    const friendly: Record<string, string> = {
      PENDING: 'Cette commande n\'est pas encore payée — tu peux simplement quitter le panier.',
      CANCELLED: 'Cette commande est déjà annulée.',
      FAILED: 'Cette commande a déjà échoué — un remboursement a été émis.',
      SHIPPED: 'Le colis est déjà en route. Contacte-nous directement pour le retour : bonjour@plio.ca',
      DELIVERED: 'La commande est livrée. Pour un retour, contacte-nous : bonjour@plio.ca',
    };
    return NextResponse.json(
      { error: friendly[order.status] ?? `Statut "${order.status}" non éligible à l'annulation.` },
      { status: 400 },
    );
  }

  if (ADMIN_EMAILS.length === 0) {
    logEmail.error({ orderId: id }, 'cancel-request : ADMIN_EMAILS not configured');
    return NextResponse.json(
      { error: 'Service indisponible temporairement. Écris-nous à bonjour@plio.ca.' },
      { status: 503 },
    );
  }

  const displayOrderId = order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase();
  const customerName = order.user.name ?? order.shipName;
  const cad = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

  const adminBody =
    `${customerName} (${order.user.email}) demande l'annulation de sa commande #${displayOrderId}.\n\n` +
    `── Statut actuel ──\n` +
    `Status : ${order.status}\n` +
    `Montant : ${cad(order.amountCents)} $ CAD\n` +
    `Province : ${order.province}\n` +
    `Livraison : ${order.shippingMethod}\n` +
    `Sinalite ID : ${order.sinaliteOrderId ?? '—'}\n\n` +
    `── Raison du client ──\n\n` +
    `${body.reason.trim()}\n\n` +
    `── Action attendue ──\n` +
    `Si la production n'a pas commencé côté Sinalite : annule via /admin/orders/${order.id} → bouton "Annuler".\n` +
    `Si la production a commencé : vérifie avec Sinalite si annulation possible avant de rembourser.`;

  // Round 37 #4 — Promise.allSettled : 1 admin email fail (typo, SES
  // suppressed) ne doit pas casser la cancel-request submission du customer.
  const sendsRaw = await Promise.allSettled(
    ADMIN_EMAILS.map(async (to) => {
      const r = await sendAdminCustomMessageEmail({
        to,
        replyTo: order.user.email,
        vars: {
          ORDER_ID: displayOrderId,
          SUBJECT: `[Annulation demandée] #${displayOrderId} · ${customerName}`,
          PREVIEW: `${customerName} demande l'annulation de #${displayOrderId} (${order.status})`,
          BODY_HTML: textToHtml(adminBody),
          ORDER_URL: `${APP_URL}/admin/orders/${order.id}`,
          SENDER_NAME: customerName,
          SENDER_EMAIL: order.user.email,
        },
      });
      return { to, sent: r.sent };
    }),
  );
  const sends = sendsRaw.map((s, i) =>
    s.status === 'fulfilled' ? s.value : { to: ADMIN_EMAILS[i]!, sent: false },
  );

  // Audit log — Audit v2 #10.7 : kind DÉDIÉ (l'acteur est le CLIENT qui demande,
  // pas un admin qui annule). Avant on réutilisait ADMIN_MANUAL_CANCEL → les
  // demandes clients (avec email client) polluaient les rapports d'annulations
  // admin. On garde adminId/adminEmail = client (acteur réel de l'événement).
  await recordAdminAudit({
    kind: 'CUSTOMER_CANCEL_REQUEST',
    adminId: session.user.id,
    adminEmail: session.user.email ?? '',
    targetType: 'ORDER',
    targetId: id,
    data: {
      status: order.status,
      reasonLength: body.reason.length,
      reason: body.reason.slice(0, 500), // snippet
    },
  });

  // finding [49] — trace CLIENT persistante (avant : seul AdminAudit + email
  // admin, rien de visible sur /orders/[id] une fois la modale fermée).
  // Écrit même si l'email admin échoue plus bas — la DEMANDE du client est
  // réelle indépendamment de la livraison de la notification interne.
  await prisma.orderEvent.create({
    data: {
      orderId: id,
      kind: 'CANCEL_REQUESTED',
      data: JSON.stringify({ actor: 'customer', reason: body.reason.slice(0, 500) }),
    },
  });

  // Slack alert si SUBMITTED ou IN_PRODUCTION (= action rapide requise
  // côté Patrick pour éviter qu'on imprime un truc que le client veut
  // annuler).
  if (order.status === 'SUBMITTED' || order.status === 'IN_PRODUCTION') {
    await sendCriticalAlert({
      severity: 'warning',
      title: `Annulation demandée — commande déjà submitted (${order.status})`,
      body: `${customerName} demande d'annuler #${displayOrderId} (${cad(order.amountCents)} $). Action rapide requise pour vérifier auprès de la presse avant production.`,
      context: {
        orderId: order.id,
        status: order.status,
        customer: order.user.email,
        amountCents: order.amountCents,
      },
      actionUrl: `/admin/orders/${order.id}`,
      actionLabel: 'Voir la commande',
    });
  }

  const anySent = sends.some((s) => s.sent);
  if (!anySent) {
    return NextResponse.json(
      { error: 'L\'envoi a échoué. Réessaye ou écris-nous à bonjour@plio.ca.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
});
