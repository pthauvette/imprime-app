/**
 * Logique business du webhook Sinalite — extraite de route.ts pour réutilisation
 * par le replay endpoint admin (POST /api/admin/webhooks/[id]/replay).
 *
 * Schema SinaliteWebhookPayload re-exporté ici (source of truth) — la route
 * l'importe pour parser le body entrant, et le replay endpoint l'utilise pour
 * valider le payload stocké en DB avant re-injection.
 *
 * Side-effects : applySinaliteStatusChange + emails (best-effort).
 */

import { z } from 'zod';
import { OrderStatus } from '@/lib/sinalite/types';
import {
  applySinaliteStatusChange,
  OrderNotFoundError,
  type SinaliteStatus,
} from '@/lib/db/orders';
import { prisma } from '@/lib/db';
import {
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail,
  sendReviewRequestEmail,
} from '@/lib/emails/send';
import { logSinalite } from '@/lib/logger';

export const SinaliteWebhookPayload = z.object({
  orderId: z.number(),
  status: OrderStatus,
  /** ISO timestamp du changement. */
  timestamp: z.string(),
  /** Optionnel — tracking number quand status === SHIPPED. */
  trackingNumber: z.string().optional(),
  /** Optionnel — carrier (UPS, FedEx) avec le tracking. */
  carrier: z.string().optional(),
  /** Optionnel — notes internes (raison d'annulation, etc.). */
  notes: z.string().optional(),
});

export type SinaliteWebhookPayloadInput = z.infer<typeof SinaliteWebhookPayload>;

/**
 * Process a Sinalite payload (post-signature, post-dedup). Stamps
 * ctx.orderId / ctx.unknown for the outcome row. Throws on handler errors.
 */
export async function processSinaliteEvent(
  payload: SinaliteWebhookPayloadInput,
  ctx: { orderId?: string; unknown?: boolean },
): Promise<void> {
  try {
    await applySinaliteStatusChange({
      sinaliteOrderId: payload.orderId,
      status: payload.status as SinaliteStatus,
      data: payload,
    });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      logSinalite.warn(
        { sinaliteOrderId: payload.orderId, status: payload.status },
        'no DB order matches Sinalite orderId',
      );
      ctx.unknown = true;
      return;
    }
    throw err;
  }

  // Email notifications (best-effort, on fetch order + user pour avoir
  // le contexte que le payload Sinalite n'a pas — customer email, adresse).
  if (payload.status === 'SHIPPED' || payload.status === 'DELIVERED' || payload.status === 'CANCELLED') {
    const order = await prisma.order.findUnique({
      where: { sinaliteOrderId: String(payload.orderId) },
      include: { user: true },
    });
    if (order) {
      ctx.orderId = order.id;
      switch (payload.status) {
        case 'SHIPPED':
          await sendOrderShippedEmail({
            order,
            user: order.user,
            trackingNumber: payload.trackingNumber,
            carrier: payload.carrier,
          });
          break;
        case 'DELIVERED':
          await sendOrderDeliveredEmail({
            order,
            user: order.user,
            deliveredAt: new Date(payload.timestamp),
          });
          void sendReviewRequestEmail({ order, user: order.user });
          break;
        case 'CANCELLED':
          await sendOrderCancelledEmail({
            order,
            user: order.user,
            reason: payload.notes ?? 'Annulation par Sinalite',
            refundAmountCents: order.amountCents,
          });
          break;
      }
    }
  } else {
    // For non-email transitions, capture orderId for the outcome row.
    const o = await prisma.order.findUnique({
      where: { sinaliteOrderId: String(payload.orderId) },
      select: { id: true },
    });
    ctx.orderId = o?.id;
  }
}
