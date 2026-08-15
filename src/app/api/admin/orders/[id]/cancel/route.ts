/**
 * POST /api/admin/orders/[id]/cancel
 *
 * Annule une commande manuellement. Combine refund Stripe + mark
 * CANCELLED + email cancellation. Différent de /refund qui peut être
 * partiel — ici c'est full cancel + full refund.
 *
 * Body: { reason: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { markRefundIssued, markOrderFailed } from '@/lib/db/orders';
import { sendOrderCancelledEmail } from '@/lib/emails/send';
import { getStripe } from '@/lib/stripe/client';
import { logStripe } from '@/lib/logger';

const BodySchema = z.object({
  reason: z.string().min(1).max(500),
  // Alignement Sinalite (F2/F3) — répercuter les frais d'annulation Sinalite
  // (min. 25 $ PAR ARTICLE) sur le remboursement. OPT-IN, défaut = refund complet :
  // un cancel côté Plio (défaut/erreur de fabrication) ne doit JAMAIS facturer le
  // client. À activer seulement pour un changement d'avis client sur une commande
  // déjà partie en production.
  chargeCancelFee: z.boolean().optional().default(false),
});

export const POST = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const order = await prisma.order.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.status === 'CANCELLED' || order.status === 'FAILED') {
    return NextResponse.json({ error: 'Order already cancelled' }, { status: 400 });
  }
  if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
    return NextResponse.json(
      { error: 'Cannot cancel a shipped/delivered order — initiate a return instead' },
      { status: 400 },
    );
  }
  // ⚠️ SOUMISSION D'ISSUE INCONNUE → NE PAS ANNULER, ET SURTOUT PAS ICI.
  //
  // C'est la route qui rend l'argent SANS que l'admin soit passé par l'encadré
  // de vérification, et elle ne lisait pas le marqueur. Le scénario est un
  // clic, pas une course :
  //
  //   `/order/new` répond `{ orderId: 481203 }` — la presse est lancée — puis
  //   la transaction de `markOrderSubmitted` est annulée (coupure du pooler).
  //   Le rattachement automatique échoue lui aussi : le marqueur reste, et
  //   l'identifiant est perdu de la base. La commande demeure **PAID** (cette
  //   branche n'appelle pas `markOrderFailed`), donc `canCancel` est vrai et
  //   le bouton « Annuler » s'affiche juste sous l'encadré rouge.
  //
  //   Clic : remboursement Stripe intégral + restauration wallet + referral,
  //   avec `computeCancelFeeCents` qui rend ZÉRO — les frais ne s'appliquent
  //   qu'à SUBMITTED/IN_PRODUCTION, or le statut est resté PAID. Plio paie
  //   l'impression et rend tout l'argent, y compris quand l'admin a coché
  //   « répercuter les frais ».
  //
  // Tant que le doute n'est pas levé, l'annulation passe par la fiche : lever
  // le blocage, rattacher le numéro, ou rembourser en connaissance de cause.
  if (order.sinaliteSubmitUncertainAt) {
    return NextResponse.json(
      {
        error:
          "Soumission partie sans réponse : la production est PEUT-ÊTRE lancée. Annuler " +
          "maintenant rembourserait intégralement une impression que l'imprimeur facturera, " +
          "et sans frais d'annulation. Tranche d'abord depuis la fiche — rattacher le numéro " +
          'fournisseur, ou lever le blocage après vérification au portail.',
      },
      { status: 409 },
    );
  }

  // Round 38 #3 — idempotencyKey : double-cancel = double refund risk.
  let refund: Stripe.Refund | null = null;
  let cancelFeeCents = 0;
  if (order.status !== 'PENDING') {
    // Alignement Sinalite F2/F3 — une fois la commande partie chez l'imprimeur
    // (SUBMITTED/IN_PRODUCTION), Sinalite facture des frais d'annulation (min. 25 $
    // PAR ARTICLE). Si l'admin choisit de les répercuter (changement d'avis client),
    // on les déduit de la part CARTE. `order.amountCents` = charge carte NETTE
    // (= grossTotal − crédits, cf. price-order.ts:222). Le frais ne sort donc QUE de
    // la part Stripe ; la part wallet/referral reste intégralement restaurée.
    const { computeCancelFeeCents } = await import('@/lib/orders/cancel-fee');
    cancelFeeCents = computeCancelFeeCents({
      status: order.status,
      chargeCancelFee: body.chargeCancelFee ?? false,
      amountCents: order.amountCents,
      itemsCount: order.itemsCount,
    });
    const refundAmountCents = order.amountCents - cancelFeeCents;

    const { createHash } = await import('node:crypto');
    const cancelIdemKey = `ca_${createHash('sha256')
      .update(JSON.stringify({ orderId: order.id, adminUserId: guard.userId, refundAmountCents }))
      .digest('hex')
      .slice(0, 48)}`;
    try {
      if (refundAmountCents > 0) {
        refund = await getStripe().refunds.create({
          payment_intent: order.paymentIntentId,
          // Sans frais → pas d'`amount` = refund COMPLET (comportement historique).
          // Avec frais → refund PARTIEL de la part carte restante.
          ...(cancelFeeCents > 0 && { amount: refundAmountCents }),
          reason: 'requested_by_customer',
          metadata: {
            orderId: order.id,
            adminUserId: guard.userId,
            reason: body.reason,
            cancelFeeCents: String(cancelFeeCents),
          },
        }, { idempotencyKey: cancelIdemKey });
        await markRefundIssued({ orderId: order.id, refundId: refund.id, amountCents: refund.amount });
      } else {
        // Cas limite : les frais couvrent toute la part carte → aucun refund Stripe
        // à émettre (la part crédit est tout de même rendue ci-dessous).
        logStripe.warn(
          { orderId: order.id, cancelFeeCents, amountCents: order.amountCents },
          'cancel: frais d\'annulation ≥ charge carte — aucun refund Stripe émis',
        );
      }
      // Audit v2 #1.4/#3.1 — restaurer INTÉGRALEMENT les crédits wallet + referral
      // débités (le refund Stripe ne rend que la part carte). Les frais d'annulation
      // ne touchent JAMAIS la part crédit → restauration inchangée. Helpers partagés,
      // idempotents + non-fatals (verrou FOR UPDATE, cf. #427).
      const { restoreWalletCreditOnFullRefund } = await import('@/lib/wallet/operations');
      await restoreWalletCreditOnFullRefund({ order, actorId: guard.userId, refundId: refund?.id });
      const { restoreReferralCreditOnFullRefund } = await import('@/lib/referrals/restore');
      await restoreReferralCreditOnFullRefund({ order, actorId: guard.userId, refundId: refund?.id });
    } catch (err) {
      return NextResponse.json(
        { error: `Refund failed: ${err instanceof Error ? err.message : 'unknown'}` },
        { status: 502 },
      );
    }
    // Order NON-PENDING (déjà payée) : refund émis ci-dessus → marque FAILED.
    await markOrderFailed({
      orderId: order.id,
      reason: body.reason,
      data: {
        refundId: refund?.id,
        adminUserId: guard.userId,
        action: 'manual-cancel',
        cancelFeeCents,
      },
    });
  } else {
    // M2/M3 — Order PENDING (jamais payée) : le crédit wallet/referral a été RÉSERVÉ
    //   (décrémenté) au create. On le restaure via releaseReservedCreditsOnCancel (transition
    //   ATOMIQUE PENDING→CANCELLED, exactement-une-fois). SANS ça le crédit serait perdu à vie
    //   (avant, l'Order finissait FAILED, jamais rattrapée par le cron qui ne libère que
    //   PENDING/FAILED). Statut final = CANCELLED → le cron de libération FAILED ne le
    //   re-restaure jamais (pas de double-restore inverse).
    const { releaseReservedCreditsOnCancel } = await import('@/lib/orders/credit-reservation');
    const rel = await releaseReservedCreditsOnCancel({ orderId: order.id, reason: 'admin-cancel' });
    if (!rel.released) {
      return NextResponse.json({ error: 'Order déjà transitionnée (annulation/paiement concurrent).' }, { status: 409 });
    }
  }

  // TODO: si l'order avait été SUBMITTED à Sinalite, faudrait aussi notifier
  // Sinalite pour annuler la production. Pour MVP on assume que c'est avant
  // production. À ajouter quand on aura un endpoint Sinalite cancel.

  await sendOrderCancelledEmail({
    order,
    user: order.user,
    reason: body.reason,
    // Audit v2 #1.5 — n'annoncer un remboursement QUE s'il a été émis. Une
    // commande PENDING (jamais débitée) ne donne lieu à aucun refund → 0, sinon
    // l'email promet « Remboursement : X $ » jamais versé.
    // Audit v3 L2 — utiliser refund.amount (montant RÉELLEMENT remboursé par
    // Stripe = le restant) et NON order.amountCents (le total) : après un refund
    // partiel préalable, annoncer le total serait faux (litiges/chargebacks).
    refundAmountCents: refund ? refund.amount : 0,
  });

  await recordAdminAudit({
    kind: 'ADMIN_MANUAL_CANCEL',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    targetId: order.id,
    data: {
      reason: body.reason,
      refundId: refund?.id ?? null,
      refundedCents: refund ? refund.amount : 0,
      cancelFeeCents,
      previousStatus: order.status,
      customerEmail: order.user.email,
    },
  });

  return NextResponse.json({
    ok: true,
    refundId: refund?.id ?? null,
    refundedCents: refund ? refund.amount : 0,
    cancelFeeCents,
  });
});
