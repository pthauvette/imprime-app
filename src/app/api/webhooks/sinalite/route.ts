/**
 * POST /api/webhooks/sinalite
 *
 * Webhook Sinalite "Status Update Callback" — déclenché à chaque changement
 * de statut d'une commande (NEW → IN_PRODUCTION → SHIPPED → DELIVERED).
 *
 * Setup côté Sinalite :
 *   apifrontend_stage.sinaliteuppy.com → Account → Web Hooks
 *   → Status Update Callback URL: https://plio.ca/api/webhooks/sinalite
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
  updateWebhookOutcome,
  OrderNotFoundError,
  type SinaliteStatus,
} from '@/lib/db/orders';
import { prisma } from '@/lib/db';
import {
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail,
} from '@/lib/emails/send';
import { logSinalite } from '@/lib/logger';

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
  // Wall-clock starts BEFORE signature verification so latency matches
  // what Sinalite observed end-to-end (including order lookup downstream).
  const start = Date.now();

  if (WEBHOOK_SECRET) {
    const signature = req.headers.get('x-sinalite-signature');
    if (signature !== WEBHOOK_SECRET) {
      logSinalite.error('invalid signature on webhook');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let payload: z.infer<typeof SinaliteWebhookPayload>;
  try {
    payload = SinaliteWebhookPayload.parse(await req.json());
  } catch (err) {
    logSinalite.error({ err }, 'payload validation failed');
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

  logSinalite.info(
    { sinaliteOrderId: payload.orderId, status: payload.status },
    'status update received',
  );

  // Mutable context so we can stamp orderId onto the WebhookEvent row
  // even on the error path.
  let dbOrderId: string | undefined;

  try {
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
        logSinalite.warn(
          { sinaliteOrderId: payload.orderId, status: payload.status },
          'no DB order matches Sinalite orderId',
        );
        await updateWebhookOutcome({
          source: 'SINALITE',
          eventId: fingerprint,
          success: true,
          statusCode: 200,
          latencyMs: Date.now() - start,
        });
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
        dbOrderId = order.id;
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
    } else {
      // For non-email status transitions, still try to capture orderId for the
      // outcome row so admin joins work — cheap follow-up lookup.
      const o = await prisma.order.findUnique({
        where: { sinaliteOrderId: String(payload.orderId) },
        select: { id: true },
      });
      dbOrderId = o?.id;
    }

    await updateWebhookOutcome({
      source: 'SINALITE',
      eventId: fingerprint,
      success: true,
      statusCode: 200,
      latencyMs: Date.now() - start,
      orderId: dbOrderId,
    });
    return NextResponse.json({ received: true, orderId: payload.orderId });
  } catch (err) {
    logSinalite.error(
      { err, sinaliteOrderId: payload.orderId, status: payload.status, orderId: dbOrderId },
      'handler error',
    );
    await updateWebhookOutcome({
      source: 'SINALITE',
      eventId: fingerprint,
      success: false,
      statusCode: 500,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Internal error',
      orderId: dbOrderId,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
