/**
 * POST /api/webhooks/sinalite
 *
 * Webhook Sinalite "Status Update Callback" — déclenché à chaque changement
 * de statut d'une commande (NEW → IN_PRODUCTION → SHIPPED → DELIVERED).
 *
 * Setup côté Sinalite :
 *   apifrontend_stage.sinaliteuppy.com → Account → Web Hooks
 *   → Status Update Callback URL: https://imprime.co/api/webhooks/sinalite
 *
 * Sécurité : on vérifie un secret partagé via le header `x-sinalite-signature`.
 * Sinalite ne fournit pas d'eventId stable → on construit un fingerprint
 * (orderId + status + timestamp) pour l'idempotence.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OrderStatus } from '@/lib/sinalite/types';
import {
  applySinaliteStatusChange,
  recordWebhookEvent,
  OrderNotFoundError,
  type SinaliteStatus,
} from '@/lib/db/orders';
import { prisma } from '@/lib/db';
import {
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail,
} from '@/lib/emails/send';

const WEBHOOK_SECRET = process.env.SINALITE_WEBHOOK_SECRET;

const SinaliteWebhookPayload = z.object({
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

export async function POST(req: Request) {
  if (WEBHOOK_SECRET) {
    const signature = req.headers.get('x-sinalite-signature');
    if (signature !== WEBHOOK_SECRET) {
      console.error('[sinalite webhook] invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let payload: z.infer<typeof SinaliteWebhookPayload>;
  try {
    payload = SinaliteWebhookPayload.parse(await req.json());
  } catch (err) {
    console.error('[sinalite webhook] payload validation failed', err);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Idempotence : fingerprint stable que Sinalite va générer identique sur retry.
  const fingerprint = `${payload.orderId}:${payload.status}:${payload.timestamp}`;
  const { isNew } = await recordWebhookEvent({
    source: 'SINALITE',
    eventId: fingerprint,
    eventType: payload.status,
  });
  if (!isNew) {
    return NextResponse.json({ received: true, deduped: true });
  }

  console.log('[sinalite webhook] order', payload.orderId, '→', payload.status);

  try {
    await applySinaliteStatusChange({
      sinaliteOrderId: payload.orderId,
      status: payload.status as SinaliteStatus,
      data: payload,
    });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      // L'order Sinalite n'a pas de match dans notre DB — possiblement créée
      // hors de notre app, ou avant le déploiement de la persistence.
      // On log et on accuse réception pour éviter les retries inutiles.
      console.warn('[sinalite webhook] no DB order for', payload.orderId);
      return NextResponse.json({ received: true, unknown: true });
    }
    throw err;
  }

  // ─── Email notifications (best-effort, ne bloque pas le webhook) ─────
  // On fetch l'order + user pour avoir le contexte complet (le payload Sinalite
  // n'a que l'orderId — pas le customer email ni l'adresse de shipping).
  if (payload.status === 'SHIPPED' || payload.status === 'DELIVERED' || payload.status === 'CANCELLED') {
    const order = await prisma.order.findUnique({
      where: { sinaliteOrderId: String(payload.orderId) },
      include: { user: true },
    });
    if (order) {
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
  }

  return NextResponse.json({ received: true, orderId: payload.orderId });
}
