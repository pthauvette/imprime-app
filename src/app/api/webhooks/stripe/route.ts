/**
 * POST /api/webhooks/stripe
 *
 * Webhook Stripe — déclenché par payment_intent.succeeded après que le client
 * paie. Flow :
 *   1. Vérifie la signature
 *   2. Check idempotence via WebhookEvent
 *   3. Trouve l'Order PENDING par paymentIntentId
 *   4. Marque PAID
 *   5. POST à Sinalite /order/new
 *   6. Marque SUBMITTED avec sinaliteOrderId
 *   7. Si Sinalite fail → refund Stripe + marque FAILED
 *
 * Setup local :
 *   stripe listen --forward-to localhost:3000/api/webhooks/stripe
 *   → copie le whsec_… dans STRIPE_WEBHOOK_SECRET
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sinalite } from '@/lib/sinalite/client';
import { SinaliteOrderRequest } from '@/lib/sinalite/types';
import { prisma } from '@/lib/db';
import {
  markOrderPaid,
  markOrderSubmitted,
  markOrderFailed,
  markRefundIssued,
  recordWebhookEvent,
  OrderNotFoundError,
} from '@/lib/db/orders';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotence : Stripe retry les webhooks jusqu'à 3 jours si on répond 5xx.
  // On insert le event.id dans WebhookEvent — si UNIQUE viol → déjà traité.
  const { isNew } = await recordWebhookEvent({
    source: 'STRIPE',
    eventId: event.id,
    eventType: event.type,
  });
  if (!isNew) {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        await handlePaymentSucceeded(event.data.object);
        break;
      }
      case 'payment_intent.payment_failed': {
        await handlePaymentFailed(event.data.object);
        break;
      }
      default:
        console.log('[stripe webhook] unhandled event:', event.type);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] handler error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}

async function handlePaymentSucceeded(intent: Stripe.PaymentIntent) {
  const order = await prisma.order.findUnique({
    where: { paymentIntentId: intent.id },
  });
  if (!order) {
    // Pas d'order DB pour cet intent → probablement un PI créé hors flow (test).
    // On log et on ignore plutôt que de planter — pas de re-try utile.
    console.error('[stripe webhook] no Order for paymentIntent', intent.id);
    return;
  }

  // Si déjà transitionnée (PAID/SUBMITTED), no-op — le replay a été dédupé
  // en amont via WebhookEvent, mais on garde la garde par sécurité.
  if (order.status !== 'PENDING') {
    console.log('[stripe webhook] order already past PENDING', order.id, order.status);
    return;
  }

  await markOrderPaid(intent.id);

  // Reconstitue le payload Sinalite depuis la DB (le snapshot intégral)
  let sinalitePayload: SinaliteOrderRequest;
  try {
    sinalitePayload = SinaliteOrderRequest.parse(JSON.parse(order.sinalitePayload));
  } catch (err) {
    await markOrderFailed({
      orderId: order.id,
      reason: 'Invalid sinalitePayload snapshot',
      data: { error: err instanceof Error ? err.message : 'parse error' },
    });
    throw err;
  }

  try {
    const result = await sinalite.createOrder(sinalitePayload);
    await markOrderSubmitted({
      orderId: order.id,
      sinaliteOrderId: result.orderId,
    });
    console.log(
      '[stripe webhook] Sinalite order created:',
      result.orderId,
      'for PI',
      intent.id,
    );
  } catch (err) {
    console.error('[stripe webhook] Sinalite createOrder FAILED', err);

    // Refund — on a pris l'argent mais on peut pas livrer
    try {
      const refund = await stripe.refunds.create({
        payment_intent: intent.id,
        reason: 'requested_by_customer',
        metadata: {
          reason: 'sinalite_creation_failed',
          orderId: order.id,
          error: err instanceof Error ? err.message.slice(0, 500) : 'unknown',
        },
      });
      await markRefundIssued({ orderId: order.id, refundId: refund.id });
      await markOrderFailed({
        orderId: order.id,
        reason: err instanceof Error ? err.message : 'Sinalite createOrder failed',
        data: { refundId: refund.id },
      });
      console.log('[stripe webhook] auto-refunded payment intent', intent.id);
    } catch (refundErr) {
      console.error(
        '[stripe webhook] CRITICAL: refund failed after Sinalite failure',
        refundErr,
      );
      await markOrderFailed({
        orderId: order.id,
        reason: 'Sinalite failed AND refund failed — manual intervention needed',
        data: {
          sinaliteError: err instanceof Error ? err.message : 'unknown',
          refundError: refundErr instanceof Error ? refundErr.message : 'unknown',
        },
      });
      // TODO: alert ops via Sentry — manual refund needed
    }

    throw err;
  }
}

async function handlePaymentFailed(intent: Stripe.PaymentIntent) {
  const order = await prisma.order.findUnique({
    where: { paymentIntentId: intent.id },
  });
  if (!order) {
    console.log('[stripe webhook] payment failed (no order):', intent.id);
    return;
  }
  try {
    await markOrderFailed({
      orderId: order.id,
      reason: intent.last_payment_error?.message ?? 'payment_failed',
      data: { code: intent.last_payment_error?.code },
    });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return;
    throw err;
  }
}
