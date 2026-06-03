/**
 * POST /api/admin/orders/[id]/refund
 *
 * Émet un refund Stripe sur la commande. Refund partiel possible via
 * body { amountCents }, sinon full refund. Crée un OrderEvent REFUND_ISSUED
 * et envoie l'email refund-issued.
 *
 * Body: { amountCents?: number, reason?: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { markRefundIssued, markOrderFailed } from '@/lib/db/orders';
import { sendRefundIssuedEmail } from '@/lib/emails/send';
import { getStripe } from '@/lib/stripe/client';

const BodySchema = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.string().min(1).max(500).optional(),
  cancelOrder: z.boolean().optional().default(false),
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
  if (order.status === 'PENDING') {
    return NextResponse.json(
      { error: 'Cannot refund a PENDING order — payment not captured yet' },
      { status: 400 },
    );
  }

  // Borne le CUMUL des refunds (Round 4 #4). Le garde-fou précédent ne comparait
  // qu'UN appel à order.amountCents → deux refunds partiels (60 $ + 60 $ sur
  // 100 $) passaient chacun mais dépassaient le total au 2e (Stripe rejette en
  // 502 brut). On dérive le déjà-remboursé depuis Stripe (source de vérité :
  // inclut aussi les refunds émis via le dashboard Stripe) et on valide contre
  // le RESTANT, pas le total.
  let alreadyRefundedCents = 0;
  try {
    const existingRefunds = await getStripe().refunds.list({
      payment_intent: order.paymentIntentId,
      limit: 100,
    });
    alreadyRefundedCents = existingRefunds.data
      .filter((r) => r.status !== 'failed' && r.status !== 'canceled')
      .reduce((sum, r) => sum + r.amount, 0);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Impossible de vérifier les remboursements existants' },
      { status: 502 },
    );
  }
  const remainingCents = Math.max(0, order.amountCents - alreadyRefundedCents);

  if (remainingCents <= 0) {
    return NextResponse.json(
      {
        error: 'Cette commande est déjà entièrement remboursée.',
        code: 'REFUND_NONE_REMAINING',
        alreadyRefundedCents,
        remainingCents: 0,
      },
      { status: 400 },
    );
  }
  if (body.amountCents !== undefined && body.amountCents > remainingCents) {
    return NextResponse.json(
      {
        error: `Montant supérieur au restant remboursable : ${(remainingCents / 100).toFixed(2)} $ sur ${(order.amountCents / 100).toFixed(2)} $ (déjà remboursé : ${(alreadyRefundedCents / 100).toFixed(2)} $).`,
        code: 'REFUND_EXCEEDS_REMAINING',
        alreadyRefundedCents,
        remainingCents,
      },
      { status: 400 },
    );
  }

  // Montant effectif : explicite si fourni, sinon le RESTANT (un « full refund »
  // après un partiel ne rembourse que ce qui reste, jamais le total d'origine).
  const refundAmount = body.amountCents ?? remainingCents;

  // Stripe refund — partial if amountCents is set, full otherwise
  //
  // Round 38 #3 — idempotencyKey : double-click admin = 2 refunds =
  // customer over-refunded. Hash inclut orderId + amount + adminUserId
  // → même admin qui retry exactement = même refund. Admin différent
  // ou amount différent = new refund (intentionnel).
  //
  // Audit v2 #5.1 — on ajoute `alreadyRefundedCents` à la clé. Sans ça, DEUX
  // refunds partiels DISTINCTS de même montant par le même admin (ex 2× 20 $)
  // produisaient la MÊME clé → Stripe renvoyait le 1er refund en cache au 2e
  // appel, mais le code notifiait/journalisait/comptait comme si un 2e avait
  // réussi → client lésé (40 $ annoncés, 20 $ versés). `alreadyRefundedCents`
  // n'avance qu'APRÈS qu'un refund a settled : un double-clic rapide lit la même
  // valeur (toujours dédupé), mais un 2e refund intentionnel lit le cumul mis à
  // jour → clé différente → vrai 2e refund.
  const { createHash } = await import('node:crypto');
  const refundIdemKey = `re_${createHash('sha256')
    .update(JSON.stringify({
      orderId: order.id,
      amountCents: body.amountCents ?? 'full',
      adminUserId: guard.userId,
      alreadyRefundedCents,
    }))
    .digest('hex')
    .slice(0, 48)}`;
  let refund: Stripe.Refund;
  try {
    refund = await getStripe().refunds.create({
      payment_intent: order.paymentIntentId,
      amount: body.amountCents,
      reason: 'requested_by_customer',
      metadata: {
        orderId: order.id,
        adminUserId: guard.userId,
        reason: body.reason ?? 'Admin manual refund',
      },
    }, { idempotencyKey: refundIdemKey });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Stripe refund failed' },
      { status: 502 },
    );
  }

  await markRefundIssued({ orderId: order.id, refundId: refund.id, amountCents: refund.amount });
  if (body.cancelOrder) {
    await markOrderFailed({
      orderId: order.id,
      reason: body.reason ?? 'Cancelled by admin after refund',
      data: { refundId: refund.id, adminUserId: guard.userId },
    });
  }

  // Round 37 #1 — Restaurer le crédit wallet appliqué si full refund.
  //
  // Avant ce fix : si customer avait payé order $100 = $80 Stripe + $20 wallet,
  // le refund ne retournait que les $80 Stripe. Le $20 wallet était PERDU
  // (real money bug — customer paie $100, reçoit $80 → -$20 silent).
  //
  // Comportement maintenant :
  //   - Full refund (pas d'amountCents passé) → Stripe full + wallet restore full
  //   - Partial refund (amountCents < order.amountCents) → Stripe partial,
  //     wallet NON touché (admin doit faire ajustement séparé si besoin)
  //
  // Rationale du choix partial : un admin qui refund partiellement décide
  // d'un montant fixe en $. Splitter proportionnellement Stripe/wallet est
  // ambigu (qu'est-ce qui est "le" refund ?). Simple + prédictible :
  // partial = Stripe only, full = restore tout.
  let walletRestoredCents = 0;
  let referralRestoredCents = 0;
  const isFullRefund = !body.amountCents || body.amountCents >= order.amountCents;

  // Round 38 #1 — Garde-fou off-by-one : si admin tape 7999¢ sur order 8000¢
  // (typo), isFullRefund=false → wallet NON restauré, customer perd ses crédits
  // silencieusement. Alert Slack pour que l'admin soit visuellement notifié
  // (cf. self-audit Round 37 — own bug introduit par Round 37 #1).
  if (!isFullRefund && order.walletCreditAppliedCents > 0) {
    const { sendCriticalAlert } = await import('@/lib/alerting/slack');
    void sendCriticalAlert({
      severity: 'warning',
      title: 'Refund partial — wallet credit NON restauré',
      body: `Admin a refund ${(refundAmount / 100).toFixed(2)} $ partiel sur order avec wallet credit ${(order.walletCreditAppliedCents / 100).toFixed(2)} $ appliqué. Le wallet reste débité côté customer. Vérifie si c'est intentionnel (full refund tape EXACT order.amountCents = ${(order.amountCents / 100).toFixed(2)} $).`,
      context: {
        orderId: order.id,
        adminUserId: guard.userId,
        partialAmountCents: refundAmount,
        orderAmountCents: order.amountCents,
        walletCreditAppliedCents: order.walletCreditAppliedCents,
        diff: order.amountCents - refundAmount,
      },
    });
  }

  if (isFullRefund) {
    // Audit v2 #1.2/#1.4 — restauration extraite en helper partagé + idempotent
    // (même logique Round 37 #1, maintenant réutilisée par /cancel et le webhook).
    const { restoreWalletCreditOnFullRefund } = await import('@/lib/wallet/operations');
    walletRestoredCents = await restoreWalletCreditOnFullRefund({
      order,
      actorId: guard.userId,
      refundId: refund.id,
    });
    // Audit v2 #3.1 — restaure aussi le crédit referral débité à la confirmation.
    const { restoreReferralCreditOnFullRefund } = await import('@/lib/referrals/restore');
    referralRestoredCents = await restoreReferralCreditOnFullRefund({
      order,
      actorId: guard.userId,
      refundId: refund.id,
    });
  }

  // Best-effort email
  await sendRefundIssuedEmail({
    order,
    user: order.user,
    refundAmountCents: refundAmount,
    reason: body.reason ?? 'Remboursement émis par notre équipe',
  });

  void recordAdminAudit({
    kind: 'ADMIN_MANUAL_REFUND',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    targetId: order.id,
    data: {
      refundId: refund.id,
      refundAmountCents: refundAmount,
      orderTotalCents: order.amountCents,
      partial: refundAmount < order.amountCents,
      walletRestoredCents,
      referralRestoredCents,
      walletCreditAppliedCents: order.walletCreditAppliedCents,
      referralCreditAppliedCents: order.referralCreditAppliedCents,
      reason: body.reason ?? null,
      cancelled: body.cancelOrder ?? false,
      customerEmail: order.user.email,
    },
  });

  return NextResponse.json({
    ok: true,
    refundId: refund.id,
    amountCents: refundAmount,
    walletRestoredCents,
    referralRestoredCents,
    cancelled: body.cancelOrder ?? false,
    // Comptabilité refund post-opération (pour affichage admin).
    alreadyRefundedCents: alreadyRefundedCents + refundAmount,
    remainingCents: Math.max(0, remainingCents - refundAmount),
  });
});
