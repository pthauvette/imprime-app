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
 * Sécurité : on vérifie un secret partagé via `x-sinalite-signature`.
 * Sinalite ne fournit pas d'eventId stable → on construit un fingerprint
 * (orderId + status + timestamp) pour l'idempotence.
 *
 * Cette route ne fait que signature + dedup + snapshot du payload + délégation
 * à processSinaliteEvent (lib/webhooks/sinalite-process). Cette séparation
 * permet à l'admin replay endpoint de réutiliser la même business logic.
 */

import { NextResponse } from 'next/server';
import {
  recordWebhookEvent,
  updateWebhookOutcome,
} from '@/lib/db/orders';
import {
  processSinaliteEvent,
  SinaliteWebhookPayload,
} from '@/lib/webhooks/sinalite-process';
import { logSinalite } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';

const WEBHOOK_SECRET = process.env.SINALITE_WEBHOOK_SECRET;

export async function POST(req: Request) {
  const start = Date.now();

  if (WEBHOOK_SECRET) {
    const signature = req.headers.get('x-sinalite-signature');
    if (signature !== WEBHOOK_SECRET) {
      logSinalite.error('invalid signature on webhook');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  // Read as text first so we can persist for replay, then parse.
  const rawBody = await req.text();
  let payload: ReturnType<typeof SinaliteWebhookPayload.parse>;
  try {
    payload = SinaliteWebhookPayload.parse(JSON.parse(rawBody));
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
    payload: rawBody,
  });
  if (!isNew) {
    return NextResponse.json({ received: true, deduped: true });
  }

  logSinalite.info(
    { sinaliteOrderId: payload.orderId, status: payload.status },
    'status update received',
  );

  const ctx: { orderId?: string; unknown?: boolean } = {};

  try {
    await processSinaliteEvent(payload, ctx);
    await updateWebhookOutcome({
      source: 'SINALITE',
      eventId: fingerprint,
      success: true,
      statusCode: 200,
      latencyMs: Date.now() - start,
      orderId: ctx.orderId,
    });
    if (ctx.unknown) {
      return NextResponse.json({ received: true, unknown: true });
    }
    return NextResponse.json({ received: true, orderId: payload.orderId });
  } catch (err) {
    const dbOrderId = ctx.orderId;
    logSinalite.error(
      { err, sinaliteOrderId: payload.orderId, status: payload.status, orderId: dbOrderId },
      'handler error',
    );
    void sendCriticalAlert({
      severity: 'warning',
      title: `Sinalite webhook handler error (${payload.status})`,
      body: 'Le webhook Sinalite a échoué — Sinalite va probablement retry mais vérifie qu\'il n\'y a pas un bug persistent.',
      context: {
        sinaliteOrderId: payload.orderId,
        status: payload.status,
        orderId: dbOrderId,
        error: err instanceof Error ? err.message : 'unknown',
      },
      ...(dbOrderId ? { actionUrl: `/admin/orders/${dbOrderId}`, actionLabel: 'Voir la commande' } : {}),
    });
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
