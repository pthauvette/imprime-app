/**
 * POST /api/admin/orders/[id]/replay-sinalite
 *
 * Re-soumet une commande à Sinalite. Cas d'usage :
 *   - L'order est en FAILED (Sinalite a refusé la première fois) → on retry
 *   - L'order est PAID mais SUBMITTED a pas marché (bug webhook) → on rattrape
 *   - L'admin veut force-resync
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { sinalite } from '@/lib/sinalite/client';
import { SinaliteOrderRequest } from '@/lib/sinalite/types';
import { markOrderSubmitted, markOrderFailed } from '@/lib/db/orders';
import { sendOrderConfirmationEmail } from '@/lib/emails/send';

export const POST = withErrorHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.sinaliteOrderId) {
    return NextResponse.json(
      { error: 'Order already submitted to Sinalite', sinaliteOrderId: order.sinaliteOrderId },
      { status: 400 },
    );
  }
  if (order.status === 'PENDING' || order.status === 'CANCELLED') {
    return NextResponse.json(
      { error: `Cannot replay an order in ${order.status} status` },
      { status: 400 },
    );
  }

  let payload;
  try {
    payload = SinaliteOrderRequest.parse(JSON.parse(order.sinalitePayload));
  } catch {
    return NextResponse.json({ error: 'Invalid sinalitePayload snapshot' }, { status: 500 });
  }

  try {
    const result = await sinalite.createOrder(payload);
    await markOrderSubmitted({ orderId: order.id, sinaliteOrderId: result.orderId });
    // Best-effort confirmation email (now that we have a Sinalite ID)
    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      include: { user: true },
    });
    if (fresh) {
      await sendOrderConfirmationEmail({ order: fresh, user: fresh.user });
    }
    return NextResponse.json({ ok: true, sinaliteOrderId: result.orderId });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Sinalite replay failed';
    await markOrderFailed({
      orderId: order.id,
      reason,
      data: { adminUserId: guard.userId, action: 'replay-sinalite' },
    });
    return NextResponse.json({ error: reason }, { status: 502 });
  }
});
