/**
 * POST /api/webhooks/stripe
 *
 * Webhook Stripe — déclenché par payment_intent.succeeded après que le client
 * paie. Cette route ne fait que :
 *   1. Vérifie la signature
 *   2. Check idempotence via WebhookEvent (+ snapshot le payload pour replay)
 *   3. Délègue à processStripeEvent (lib/webhooks/stripe-process)
 *   4. Patch le WebhookEvent avec l'outcome (success/latency/error)
 *
 * La business logic (resolve Order → mark PAID → POST Sinalite → fallback
 * refund) vit dans lib/webhooks/stripe-process pour qu'elle puisse être
 * appelée aussi par l'endpoint admin replay (POST /api/admin/webhooks/[id]/replay).
 *
 * Setup local :
 *   stripe listen --forward-to localhost:3000/api/webhooks/stripe
 *   → copie le whsec_… dans STRIPE_WEBHOOK_SECRET
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  recordWebhookEvent,
  updateWebhookOutcome,
} from '@/lib/db/orders';
import { processStripeEvent } from '@/lib/webhooks/stripe-process';
import { logStripe } from '@/lib/logger';
import { getStripe } from '@/lib/stripe/client';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
/**
 * Tolerance (en secondes) pour rejeter un webhook dont le timestamp est
 * trop ancien. Default Stripe SDK = 300s (5 min). On set explicit pour :
 *   - Bloquer les replay attacks même si un attaquant a capturé un payload
 *     signé valide (signature valide indéfiniment, c'est l'écart timestamp
 *     qui sert de garde temporel).
 *   - Documenter l'intent : si on relâche un jour, c'est volontaire.
 *
 * 5 min couvre largement les retries Stripe (qui re-send sous 30s).
 */
const WEBHOOK_TOLERANCE_SECONDS = 300;

export async function POST(req: Request) {
  // Wall-clock starts BEFORE signature verification so latency reflects
  // what Stripe observed end-to-end.
  const start = Date.now();

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    // constructEvent throw avec message "Timestamp outside the tolerance zone"
    // si l'écart entre Stripe's timestamp et now() dépasse tolerance.
    event = getStripe().webhooks.constructEvent(
      rawBody,
      sig,
      WEBHOOK_SECRET,
      WEBHOOK_TOLERANCE_SECONDS,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    const isReplay = message.toLowerCase().includes('timestamp');
    logStripe.error({ err, replayAttempt: isReplay }, 'signature verification failed');
    return NextResponse.json(
      { error: isReplay ? 'Stale webhook rejected' : 'Invalid signature' },
      { status: 400 },
    );
  }

  // Idempotence (Audit v2 #2.2) : on ne déduplique QUE si une tentative
  // précédente a RÉUSSI. Un échec transitoire (row success=false) doit pouvoir
  // être re-traité par le retry automatique Stripe, sinon il est neutralisé.
  // payload = rawBody pour replay admin.
  const { isNew, alreadyCompleted } = await recordWebhookEvent({
    source: 'STRIPE',
    eventId: event.id,
    eventType: event.type,
    payload: rawBody,
  });
  if (!isNew && alreadyCompleted) {
    return NextResponse.json({ received: true, deduped: true });
  }

  const ctx: { orderId?: string } = {};

  try {
    await processStripeEvent(event, ctx);
    await updateWebhookOutcome({
      source: 'STRIPE',
      eventId: event.id,
      success: true,
      statusCode: 200,
      latencyMs: Date.now() - start,
      orderId: ctx.orderId,
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    logStripe.error({ err, eventId: event.id, eventType: event.type, orderId: ctx.orderId }, 'handler error');
    await updateWebhookOutcome({
      source: 'STRIPE',
      eventId: event.id,
      success: false,
      statusCode: 500,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Internal error',
      orderId: ctx.orderId,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
