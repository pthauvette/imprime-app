/**
 * POST /api/admin/quotes/[id]/create-order
 *
 * finding [129] — devis sur mesure ACCEPTED → commande payable. Crée un
 * Order PENDING (skipSinaliteSubmission: true — production gérée HORS
 * Sinalite, cf. db/orders.ts createManualOrder) puis envoie au client un
 * lien de paiement réutilisant TEL QUEL /payment/retry/[orderId] (aucun
 * nouveau code Stripe : cette page crée sa PROPRE Checkout Session au clic,
 * le webhook la rattache via metadata.orderId — cf.
 * stripe-process.ts handlePaymentSucceeded, chemin déjà durci).
 *
 * Idempotent : refuse si ce devis a déjà une commande liée.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { findOrCreateUserByEmail, createManualOrder, isPrismaUniqueError } from '@/lib/db/orders';
import { paymentRetryToken } from '@/lib/payment/retry-token';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { logAdmin } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BodySchema = z.object({
  // Garde-fou 100k$ — au-delà, à vérifier manuellement (fat-finger admin).
  quotedAmountCents: z.number().int().positive().max(100_000_00),
  shipName: z.string().min(1).max(200),
  shipLine1: z.string().min(1).max(200),
  shipLine2: z.string().max(200).optional(),
  shipCity: z.string().min(1).max(100),
  shipProvince: z.string().min(2).max(2),
  shipPostalCode: z.string().min(1).max(10),
  shipPhone: z.string().min(1).max(30),
});

export const POST = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const quote = await prisma.customQuoteRequest.findUnique({ where: { id } });
  if (!quote) {
    return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });
  }
  if (quote.status !== 'ACCEPTED') {
    return NextResponse.json(
      { error: `Le devis doit être ACCEPTED avant de créer la commande (statut actuel : ${quote.status})` },
      { status: 400 },
    );
  }
  if (quote.orderId) {
    return NextResponse.json({ error: 'Une commande a déjà été créée pour ce devis' }, { status: 400 });
  }

  const user = await findOrCreateUserByEmail({
    email: quote.email,
    // CustomQuoteRequest n'a qu'un champ `name` complet (pas de first/last
    // séparés) ; posé tel quel sur firstName plutôt que deviner un split
    // fragile ("Jean-Pierre De La Fontaine" etc.).
    firstName: quote.name,
    phone: quote.phone ?? undefined,
  });

  // Placeholder unique déterministe (PAS un vrai PaymentIntent Stripe) — le
  // lien de paiement (/payment/retry) crée sa PROPRE Checkout Session au
  // clic ; le webhook rattache via metadata.orderId, jamais via ce placeholder.
  const manualPaymentIntentId = `manual_quote_${quote.id}`;
  let order;
  try {
    order = await createManualOrder({
      userId: user.id,
      paymentIntentId: manualPaymentIntentId,
      amountCents: body.quotedAmountCents,
      productSummary: `Devis sur mesure — ${quote.projectType}`,
      shippingMethod: 'Manuel (hors Sinalite)',
      province: body.shipProvince,
      shipName: body.shipName,
      shipLine1: body.shipLine1,
      shipLine2: body.shipLine2,
      shipCity: body.shipCity,
      shipProvince: body.shipProvince,
      shipPostalCode: body.shipPostalCode,
      shipPhone: body.shipPhone,
    });
  } catch (err) {
    // Revue money-path-reviewer — auto-guérison d'un crash partiel : l'Order
    // a déjà été créée par une tentative précédente (réseau timeout avant que
    // quote.orderId n'ait été posé plus bas) OU double-clic admin quasi
    // simultané. Le placeholder est DÉTERMINISTE par quote.id → on retrouve
    // l'Order déjà créée au lieu de boucler indéfiniment sur une violation de
    // contrainte unique.
    if (!isPrismaUniqueError(err)) throw err;
    const existing = await prisma.order.findUnique({ where: { paymentIntentId: manualPaymentIntentId } });
    if (!existing) throw err;
    order = existing;
  }

  await prisma.$transaction([
    prisma.customQuoteRequest.update({
      where: { id },
      data: { orderId: order.id, quotedAmountCents: body.quotedAmountCents },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'MANUAL_ORDER_CREATED',
        data: JSON.stringify({ quoteId: quote.id, adminEmail: guard.user.email }),
      },
    }),
  ]);

  const token = paymentRetryToken(order.id);
  const paymentUrl = `${APP_URL}/payment/retry/${order.id}?t=${token}`;

  try {
    await sendAdminCustomMessageEmail({
      to: quote.email,
      replyTo: guard.user.email,
      vars: {
        ORDER_ID: order.id.slice(-6).toUpperCase(),
        SUBJECT: `Ta commande Plio est prête à payer — ${quote.projectType}`,
        PREVIEW: 'Ton devis est confirmé, il ne reste que le paiement.',
        BODY_HTML:
          `<p>Bonjour,</p><p>Ton devis pour <strong>${escapeHtml(quote.projectType)}</strong> est confirmé. ` +
          `Clique sur le bouton ci-dessous pour compléter le paiement de <strong>${(body.quotedAmountCents / 100).toFixed(2)} $</strong> et lancer la production.</p>`,
        ORDER_URL: paymentUrl,
        SENDER_NAME: guard.user.email.split('@')[0] || 'Plio',
        SENDER_EMAIL: 'bonjour@plio.ca',
      },
    });
  } catch (err) {
    logAdmin.error({ err, quoteId: id, orderId: order.id }, 'quote create-order: envoi du lien de paiement échoué');
    // Non-fatal : la commande + le lien existent déjà (retournés ci-dessous),
    // l'admin peut copier/coller le lien manuellement si l'email échoue.
  }

  await recordAdminAudit({
    kind: 'ADMIN_QUOTE_DECISION',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'QUOTE',
    targetId: id,
    data: {
      action: 'QUOTE_CREATE_ORDER',
      requestId: id,
      orderId: order.id,
      quotedAmountCents: body.quotedAmountCents,
    },
  });

  return NextResponse.json({ ok: true, orderId: order.id, paymentUrl });
});
