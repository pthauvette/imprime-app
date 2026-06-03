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
        case 'CANCELLED': {
          // Audit v2 #1.3 — Sinalite annule la production : il faut ÉMETTRE le
          // refund Stripe + restaurer le wallet AVANT d'annoncer un remboursement.
          // Avant, on envoyait un email « Remboursement : X $ » SANS aucun refund
          // (faux + risque chargeback + pratique trompeuse). On n'annonce
          // désormais que le montant RÉELLEMENT remboursé.
          let refundedCents = 0;
          if (order.paymentIntentId) {
            try {
              const { getStripe } = await import('@/lib/stripe/client');
              const { createHash } = await import('node:crypto');
              const idem = `sinalite_cancel_${createHash('sha256').update(order.paymentIntentId).digest('hex').slice(0, 40)}`;
              const refund = await getStripe().refunds.create(
                {
                  payment_intent: order.paymentIntentId,
                  reason: 'requested_by_customer',
                  metadata: { orderId: order.id, reason: 'sinalite_cancelled' },
                },
                { idempotencyKey: idem },
              );
              const { markRefundIssued } = await import('@/lib/db/orders');
              await markRefundIssued({ orderId: order.id, refundId: refund.id });
              const { restoreWalletCreditOnFullRefund } = await import('@/lib/wallet/operations');
              await restoreWalletCreditOnFullRefund({ order, refundId: refund.id });
              refundedCents = order.amountCents;
            } catch (err) {
              // Refund échoué → NE PAS prétendre rembourser (refundedCents reste 0).
              // Alerter pour remboursement manuel.
              logSinalite.error(
                { err, orderId: order.id, paymentIntentId: order.paymentIntentId },
                'Sinalite CANCELLED — refund Stripe FAILED',
              );
              const { sendCriticalAlert } = await import('@/lib/alerting/slack');
              void sendCriticalAlert({
                severity: 'critical',
                title: 'Sinalite CANCELLED — refund Stripe ÉCHOUÉ',
                body: `Commande annulée par Sinalite mais le refund automatique a échoué. Rembourse manuellement le client.`,
                context: {
                  orderId: order.id,
                  paymentIntentId: order.paymentIntentId,
                  error: err instanceof Error ? err.message : 'unknown',
                },
                actionUrl: `/admin/orders/${order.id}`,
                actionLabel: 'Voir la commande',
              });
            }
          }
          await sendOrderCancelledEmail({
            order,
            user: order.user,
            reason: payload.notes ?? 'Annulation par Sinalite',
            refundAmountCents: refundedCents, // 0 si refund non émis → pas de fausse promesse
          });
          break;
        }
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
