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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

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

  const refundAmount = body.amountCents ?? order.amountCents;
  if (refundAmount > order.amountCents) {
    return NextResponse.json(
      { error: 'Refund amount exceeds order total' },
      { status: 400 },
    );
  }

  // Stripe refund — partial if amountCents is set, full otherwise
  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: order.paymentIntentId,
      amount: body.amountCents,
      reason: 'requested_by_customer',
      metadata: {
        orderId: order.id,
        adminUserId: guard.userId,
        reason: body.reason ?? 'Admin manual refund',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Stripe refund failed' },
      { status: 502 },
    );
  }

  await markRefundIssued({ orderId: order.id, refundId: refund.id });
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

  if (isFullRefund && order.walletCreditAppliedCents > 0) {
    try {
      const { recordWalletTx } = await import('@/lib/wallet/operations');
      await recordWalletTx({
        userId: order.userId,
        kind: 'REFUND',
        amountCents: order.walletCreditAppliedCents, // POSITIVE — credit back
        orderId: order.id,
        adminId: guard.userId,
        description: `Refund order #${order.id.slice(-6)} — wallet credit restored`,
      });
      walletRestoredCents = order.walletCreditAppliedCents;
    } catch (err) {
      // Non-fatal : Stripe refund a déjà succeed, l'order audit le note.
      // Admin doit reconcilier manuellement le wallet (via Slack alert).
      const { logStripe } = await import('@/lib/logger');
      logStripe.error(
        { err, orderId: order.id, walletAppliedCents: order.walletCreditAppliedCents },
        'wallet restore on refund failed (non-fatal — manual reconcile needed)',
      );
      const { sendCriticalAlert } = await import('@/lib/alerting/slack');
      void sendCriticalAlert({
        severity: 'critical',
        title: 'Wallet restore on refund FAILED',
        body: `Stripe refund OK mais wallet credit non restauré. Ajuste manuellement /admin/users/${order.userId}.`,
        context: {
          orderId: order.id,
          refundId: refund.id,
          walletAppliedCents: order.walletCreditAppliedCents,
          error: err instanceof Error ? err.message : 'unknown',
        },
      });
    }
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
      walletCreditAppliedCents: order.walletCreditAppliedCents,
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
    cancelled: body.cancelOrder ?? false,
  });
});
