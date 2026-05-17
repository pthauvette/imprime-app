/**
 * POST /api/admin/orders/[id]/resend-confirmation
 *
 * Re-shoot l'email order-confirmation. Pratique quand un user dit avoir
 * pas reçu le mail, ou pour test SES après changement de config.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
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

  const result = await sendOrderConfirmationEmail({ order, user: order.user });

  // Le queue helper retourne { sent, id }. Si sent=false, l'email est queued
  // pour retry automatique — pas un échec final, juste pas envoyé du premier
  // coup. Le cron /api/cron/email-retry retentera.
  return NextResponse.json({
    ok: true,
    to: order.user.email,
    sent: result.sent,
    deliveryId: result.id,
  });
});
