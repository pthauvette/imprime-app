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
import { verifySinaliteSignature } from '@/lib/webhooks/sinalite-signature';
import { logSinalite } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';

const WEBHOOK_SECRET = process.env.SINALITE_WEBHOOK_SECRET;

/**
 * Max age d'un webhook Sinalite (en ms) accepté pour mitigation replay-attack.
 *
 * Round 36 #2 — Réduit de 1h à 5 min (aligné avec Stripe tolerance).
 * 1h donnait à un attaquant une fenêtre énorme pour rejouer un payload
 * capturé (ex : via proxy de logging compromis, ou backup leaké). 5 min
 * couvre les retries Sinalite normaux (<10s typique, max 1-2 min en pire
 * cas) + clock skew. Si un retry Sinalite arrive après 5 min, il est rare
 * et un manual replay admin reste possible.
 *
 * Combiné avec l'idempotence (fingerprint), couvre les 2 vecteurs :
 * same-content replay (idempotence) + stale-content replay (timestamp window).
 */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;
/** Clock-skew tolérée dans le futur (Sinalite envoie sur l'horloge serveur). */
const MAX_TIMESTAMP_FUTURE_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  const start = Date.now();

  // Read as text first so we can persist for replay, then parse + verify HMAC.
  const rawBody = await req.text();

  // ─── Signature verification (mandatory in production) ────────────────
  // Avant : if (WEBHOOK_SECRET) — si env vide en prod, ANY unsigned payload
  // était accepté → pouvait advance orders à DELIVERED. Maintenant : hard-fail
  // en prod si secret missing. En dev/test, on log un warn et on continue
  // pour pas casser les fixtures locales.
  if (!WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      logSinalite.error('SINALITE_WEBHOOK_SECRET not set in production — rejecting webhook');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    logSinalite.warn('SINALITE_WEBHOOK_SECRET not set — allowing in non-prod (DO NOT use this in production)');
  } else {
    const signature = req.headers.get('x-sinalite-signature');
    if (!verifySinaliteSignature(rawBody, signature, WEBHOOK_SECRET)) {
      logSinalite.error({ hasHeader: !!signature }, 'invalid signature on webhook');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let payload: ReturnType<typeof SinaliteWebhookPayload.parse>;
  try {
    payload = SinaliteWebhookPayload.parse(JSON.parse(rawBody));
  } catch (err) {
    logSinalite.error({ err }, 'payload validation failed');
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Timestamp freshness — défense replay-attack. Sinalite ne signe pas le
  // timestamp (juste un secret partagé fixe), donc on doit valider l'écart.
  const eventTime = Date.parse(payload.timestamp);
  if (Number.isNaN(eventTime)) {
    logSinalite.error({ ts: payload.timestamp }, 'invalid timestamp');
    return NextResponse.json({ error: 'Invalid timestamp' }, { status: 400 });
  }
  const ageMs = Date.now() - eventTime;
  if (ageMs > MAX_TIMESTAMP_AGE_MS) {
    logSinalite.error(
      { ts: payload.timestamp, ageMs, orderId: payload.orderId },
      'stale webhook rejected — possible replay attack',
    );
    return NextResponse.json({ error: 'Stale webhook rejected' }, { status: 400 });
  }
  if (ageMs < -MAX_TIMESTAMP_FUTURE_MS) {
    logSinalite.error(
      { ts: payload.timestamp, futureMs: -ageMs, orderId: payload.orderId },
      'webhook timestamp in future beyond clock-skew tolerance',
    );
    return NextResponse.json({ error: 'Invalid timestamp' }, { status: 400 });
  }

  // Idempotence : fingerprint stable que Sinalite va générer identique sur retry.
  // Audit v2 #2.2 — dedup seulement sur succès confirmé : un échec transitoire
  // (success=false) doit pouvoir être re-traité au retry.
  const fingerprint = `${payload.orderId}:${payload.status}:${payload.timestamp}`;
  const { isNew, alreadyCompleted } = await recordWebhookEvent({
    source: 'SINALITE',
    eventId: fingerprint,
    eventType: payload.status,
    payload: rawBody,
  });
  if (!isNew && alreadyCompleted) {
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
    await sendCriticalAlert({
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
