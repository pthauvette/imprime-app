/**
 * POST /api/admin/orders/bulk
 *
 * Bulk actions admin sur plusieurs commandes. Body :
 *   { ids: string[], action, ...params }
 *
 * Actions :
 *   - note       : append à adminNotes (multi-line, préfixé par date + admin)
 *   - markStatus : transition de status sur N orders. Whitelist :
 *                  IN_PRODUCTION | SHIPPED | DELIVERED (les ops courantes).
 *                  Pas de CANCELLED ou FAILED ici — faut passer par
 *                  /admin/orders/[id] où on a le full context (refund auto).
 *                  Si markStatus=SHIPPED, trackingNumber + carrier optional
 *                  → écrits dans OrderEvent.data pour /track + emails.
 *
 * Cap 100 ids par requête.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { OU_TRANCHEE } from '@/lib/orders/uncertain-marker';

const BULK_ALLOWED_STATUSES = ['IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] as const;

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('note'),
    ids: z.array(z.string().min(1)).min(1).max(100),
    note: z.string().min(1).max(1000),
  }),
  z.object({
    action: z.literal('markStatus'),
    ids: z.array(z.string().min(1)).min(1).max(100),
    status: z.enum(BULK_ALLOWED_STATUSES),
    trackingNumber: z.string().min(1).max(80).optional(),
    carrier: z.string().min(1).max(40).optional(),
    // Opt-in explicite : « ces N commandes partent dans UN seul colis, donc un
    // tracking commun est légitime ». Sans ça, on REFUSE un tracking commun sur
    // >1 commande (sinon chaque client reçoit le tracking d'un autre — cf. guard
    // plus bas). Une commande seule n'a jamais besoin de ce flag.
    groupedShipment: z.boolean().optional(),
  }),
  // Round 23 #2 — bulk resend confirmation. Safe : juste un email,
  // pas de side-effect Stripe/Sinalite. Cap 50 (vs 100 pour les autres
  // actions) pour limiter SES throttle si beaucoup d'admins lancent
  // des bulks en parallèle.
  z.object({
    action: z.literal('resendConfirmation'),
    ids: z.array(z.string().min(1)).min(1).max(50),
  }),
]);

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);

  let count = 0;
  if (body.action === 'note') {
    // Append note préfixée date + admin (les vieilles notes restent)
    const prefix = `\n\n[${new Date().toISOString().slice(0, 10)} · ${guard.user.email}] `;
    // Tx pour atomicité — Prisma n'a pas de update many avec concat,
    // donc on fetch + update individuellement dans une tx.
    const existing = await prisma.order.findMany({
      where: { id: { in: body.ids } },
      select: { id: true, adminNotes: true },
    });
    await prisma.$transaction(
      existing.map((o) =>
        prisma.order.update({
          where: { id: o.id },
          data: {
            adminNotes: (o.adminNotes ?? '') + prefix + body.note,
          },
        }),
      ),
    );
    count = existing.length;
  } else if (body.action === 'resendConfirmation') {
    // Round 23 #2 — bulk resend confirmation email. On filter aux orders
    // PAID+ (pas PENDING, n'a aucun sens) et qui ont un user (pas guest
    // orphans). On envoie en parallèle batch ; chacun fail isolé.
    const eligible = await prisma.order.findMany({
      where: {
        id: { in: body.ids },
        status: { notIn: ['PENDING', 'FAILED'] },
        // ⚠️ EXCLUSION DES COMMANDES À TRANCHER. Ce gabarit affirme « c'est
        // imprimé! » et joint la facture. Le filtre `?flag=incertaine` que ce
        // lot ajoute rend le geste groupé naturel — sélectionner tout, puis
        // « Renvoyer la confirmation » — et N clients apprendraient d'un coup
        // que leur commande est imprimée alors qu'on ne peut pas le confirmer.
        ...OU_TRANCHEE,
      },
      include: { user: true },
    });

    const { sendOrderConfirmationEmail } = await import('@/lib/emails/send');
    const results = await Promise.allSettled(
      eligible.map((order) =>
        sendOrderConfirmationEmail({ order, user: order.user }),
      ),
    );
    count = results.filter((r) => r.status === 'fulfilled' && r.value.sent).length;
  } else if (body.action === 'markStatus') {
    // Bulk status transition. On exclut les orders déjà dans un état
    // terminal (DELIVERED, CANCELLED, FAILED) pour pas régresser
    // accidentellement. Refund n'est PAS déclenché ici — c'est juste
    // un status flip, pas de side-effect Stripe.
    const eligible = await prisma.order.findMany({
      where: {
        id: { in: body.ids },
        status: { notIn: ['DELIVERED', 'CANCELLED', 'FAILED'] },
        // Même exclusion que la route unitaire : avancer le statut d'une
        // commande à trancher rend `attach-sinalite-id` impossible
        // (`markOrderSubmitted` n'accepte que PAID|FAILED), donc supprime en
        // silence la seule résolution correcte.
        ...OU_TRANCHEE,
      },
      select: { id: true, status: true, sinaliteOrderId: true },
    });

    // Garde-fou tracking commun : un même numéro ne peut pas s'appliquer à
    // plusieurs commandes DISTINCTES (chaque client recevrait, dans son email
    // et /track, le tracking de quelqu'un d'autre). On bloque sauf envoi groupé
    // explicite (un seul colis). On se base sur eligible.length : si une seule
    // commande recevra réellement le tracking, c'est sans danger.
    if (body.trackingNumber && eligible.length > 1 && !body.groupedShipment) {
      return NextResponse.json(
        {
          error:
            "Un numéro de tracking commun ne peut pas s'appliquer à plusieurs commandes distinctes — chaque client recevrait le tracking d'un autre. Ajoute le tracking commande par commande, ou coche « envoi groupé » si elles partent dans un seul colis.",
          code: 'BULK_TRACKING_MULTI',
        },
        { status: 400 },
      );
    }

    const eventData = JSON.stringify({
      status: body.status,
      ...(body.trackingNumber ? { trackingNumber: body.trackingNumber } : {}),
      ...(body.carrier ? { carrier: body.carrier } : {}),
      source: 'admin_bulk',
    });

    await prisma.$transaction([
      prisma.order.updateMany({
        where: { id: { in: eligible.map((o) => o.id) } },
        data: { status: body.status },
      }),
      // OrderEvent par order pour tracer la transition + permettre
      // /track de récupérer trackingNumber/carrier via le timeline helper.
      prisma.orderEvent.createMany({
        data: eligible.map((o) => ({
          orderId: o.id,
          kind: 'SINALITE_STATUS_CHANGED',
          data: eventData,
        })),
      }),
    ]);
    count = eligible.length;
  }

  await recordAdminAudit({
    kind: 'ADMIN_BULK_STATUS_UPDATE',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    data: {
      action: `ORDER_BULK_${body.action.toUpperCase()}`,
      ids: body.ids,
      count,
      ...(body.action === 'markStatus'
        ? {
            status: body.status,
            trackingNumber: body.trackingNumber,
            carrier: body.carrier,
            ...(body.groupedShipment ? { groupedShipment: true } : {}),
          }
        : {}),
    },
  });

  return NextResponse.json({ ok: true, count });
});
