/**
 * POST /api/admin/orders/[id]/status
 *
 * Audit admin 2026-07 §8.2 — faire avancer UNE commande (→ IN_PRODUCTION,
 * → SHIPPED [+ tracking/carrier], → DELIVERED) depuis sa fiche. Avant, le SEUL
 * chemin était le bulk de la liste (quitter la fiche, retrouver la commande,
 * cocher, ouvrir le form bulk) — détour systématique sur l'action de
 * fulfillment la plus fréquente.
 *
 * Même whitelist et mêmes effets que le bulk markStatus (orders/bulk/route.ts) :
 * transition de statut + OrderEvent SINALITE_STATUS_CHANGED (lu par /track et
 * les emails pour le tracking). Pas de CANCELLED/FAILED ici — ces chemins
 * passent par /cancel et /refund (side-effects Stripe).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const ALLOWED_STATUSES = ['IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] as const;

const BodySchema = z.object({
  status: z.enum(ALLOWED_STATUSES),
  trackingNumber: z.string().min(1).max(80).optional(),
  carrier: z.string().min(1).max(40).optional(),
});

export const POST = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  // PENDING = jamais payée (pas de fulfillment à avancer) ; CANCELLED/FAILED =
  // voidée ; DELIVERED = terminal. Même périmètre que le bulk (+ PENDING exclu :
  // le bulk l'acceptait par omission, sans justification).
  if (['PENDING', 'CANCELLED', 'FAILED', 'DELIVERED'].includes(order.status)) {
    return NextResponse.json(
      { error: `Impossible de faire avancer une commande ${order.status}` },
      { status: 400 },
    );
  }
  if (order.status === body.status) {
    return NextResponse.json({ error: `Commande déjà en ${body.status}` }, { status: 400 });
  }

  const eventData = JSON.stringify({
    status: body.status,
    ...(body.trackingNumber ? { trackingNumber: body.trackingNumber } : {}),
    ...(body.carrier ? { carrier: body.carrier } : {}),
    source: 'admin_single',
  });

  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { status: body.status } }),
    prisma.orderEvent.create({
      data: { orderId: order.id, kind: 'SINALITE_STATUS_CHANGED', data: eventData },
    }),
  ]);

  await recordAdminAudit({
    kind: 'ADMIN_ORDER_STATUS_CHANGE',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    targetId: order.id,
    data: {
      previousStatus: order.status,
      status: body.status,
      trackingNumber: body.trackingNumber,
      carrier: body.carrier,
    },
  });

  return NextResponse.json({ ok: true, status: body.status });
});
