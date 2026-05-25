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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

const BodySchema = z.object({
  reason: z.string().min(1).max(500),
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

  // Refund full
  // Round 38 #3 — idempotencyKey : double-cancel = double refund risk.
  let refund: Stripe.Refund | null = null;
  if (order.status !== 'PENDING') {
    const { createHash } = await import('node:crypto');
    const cancelIdemKey = `ca_${createHash('sha256')
      .update(JSON.stringify({ orderId: order.id, adminUserId: guard.userId }))
      .digest('hex')
      .slice(0, 48)}`;
    try {
      refund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          orderId: order.id,
          adminUserId: guard.userId,
          reason: body.reason,
        },
      }, { idempotencyKey: cancelIdemKey });
      await markRefundIssued({ orderId: order.id, refundId: refund.id });
    } catch (err) {
      return NextResponse.json(
        { error: `Refund failed: ${err instanceof Error ? err.message : 'unknown'}` },
        { status: 502 },
      );
    }
  }

  await markOrderFailed({
    orderId: order.id,
    reason: body.reason,
    data: {
      refundId: refund?.id,
      adminUserId: guard.userId,
      action: 'manual-cancel',
    },
  });

  // TODO: si l'order avait été SUBMITTED à Sinalite, faudrait aussi notifier
  // Sinalite pour annuler la production. Pour MVP on assume que c'est avant
  // production. À ajouter quand on aura un endpoint Sinalite cancel.

  await sendOrderCancelledEmail({
    order,
    user: order.user,
    reason: body.reason,
    refundAmountCents: order.amountCents,
  });

  void recordAdminAudit({
    kind: 'ADMIN_MANUAL_CANCEL',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    targetId: order.id,
    data: {
      reason: body.reason,
      refundId: refund?.id ?? null,
      refundedCents: refund ? order.amountCents : 0,
      previousStatus: order.status,
      customerEmail: order.user.email,
    },
  });

  return NextResponse.json({
    ok: true,
    refundId: refund?.id ?? null,
    refundedCents: refund ? order.amountCents : 0,
  });
});
