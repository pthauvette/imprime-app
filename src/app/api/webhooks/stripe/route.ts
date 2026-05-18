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
  updateWebhookOutcome,
  OrderNotFoundError,
} from '@/lib/db/orders';
import {
  sendOrderConfirmationEmail,
  sendOrderCancelledEmail,
  sendRefundIssuedEmail,
} from '@/lib/emails/send';
import { logStripe } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

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
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    logStripe.error({ err }, 'signature verification failed');
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

  // Mutable context so inner handlers can stamp orderId even if they throw.
  const ctx: { orderId?: string } = {};

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        await handlePaymentSucceeded(event.data.object, ctx);
        break;
      }
      case 'payment_intent.payment_failed': {
        await handlePaymentFailed(event.data.object, ctx);
        break;
      }
      default:
        logStripe.info({ eventType: event.type }, 'unhandled event');
    }
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

async function handlePaymentSucceeded(
  intent: Stripe.PaymentIntent,
  ctx: { orderId?: string },
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { paymentIntentId: intent.id },
  });
  if (!order) {
    // Pas d'order DB pour cet intent → probablement un PI créé hors flow (test).
    // On log et on ignore plutôt que de planter — pas de re-try utile.
    logStripe.error({ intentId: intent.id }, 'no Order for paymentIntent');
    return;
  }
  ctx.orderId = order.id;

  // Si déjà transitionnée (PAID/SUBMITTED), no-op — le replay a été dédupé
  // en amont via WebhookEvent, mais on garde la garde par sécurité.
  if (order.status !== 'PENDING') {
    logStripe.info({ orderId: order.id, status: order.status }, 'order already past PENDING');
    return;
  }

  await markOrderPaid(intent.id);

  // Best-effort : award du crédit de parrainage si l'user a un referredByCode
  // et c'est sa 1ère commande payée. Helper est idempotent (via @unique sur
  // refereeUserId) donc replay du webhook = safe. Si fail, log silencieux —
  // on n'interrompt pas le flow paiement pour un crédit accessoire.
  try {
    const { awardReferralCreditIfEligible } = await import('@/lib/referrals/award');
    await awardReferralCreditIfEligible({ userId: order.userId, orderId: order.id });
  } catch (err) {
    logStripe.error({ err, orderId: order.id }, 'referral award threw (non-fatal)');
  }

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
    logStripe.info(
      { sinaliteOrderId: result.orderId, intentId: intent.id, orderId: order.id },
      'Sinalite order created',
    );

    // Best-effort confirmation email — fetch fresh order to get sinaliteOrderId
    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      include: { user: true },
    });
    if (fresh) {
      await sendOrderConfirmationEmail({ order: fresh, user: fresh.user });
    }
  } catch (err) {
    logStripe.error({ err, orderId: order.id, intentId: intent.id }, 'Sinalite createOrder FAILED');

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
      logStripe.info(
        { intentId: intent.id, refundId: refund.id, orderId: order.id },
        'auto-refunded payment intent',
      );

      // Warning Slack — recovered scenario (auto-refund a marché) mais on
      // veut quand même savoir vite : ça peut indiquer un problème Sinalite
      // général (down, mauvais credentials, wallet vide) qui va impacter
      // toutes les prochaines commandes.
      void sendCriticalAlert({
        severity: 'warning',
        title: 'Sinalite createOrder failed — auto-refund OK',
        body: `Le customer a été automatiquement remboursé. Si tu vois plusieurs alertes comme ça en peu de temps, vérifie Sinalite (wallet, credentials, status).`,
        context: {
          orderId: order.id,
          paymentIntentId: intent.id,
          refundId: refund.id,
          sinaliteError: err instanceof Error ? err.message : 'unknown',
        },
        actionUrl: `/admin/orders/${order.id}`,
        actionLabel: 'Voir la commande',
      });

      // Best-effort cancellation + refund emails au customer
      const fresh = await prisma.order.findUnique({
        where: { id: order.id },
        include: { user: true },
      });
      if (fresh) {
        const reason = err instanceof Error ? err.message : 'Erreur de production interne';
        const cardLast4 = extractCardLast4(intent);
        await sendOrderCancelledEmail({
          order: fresh,
          user: fresh.user,
          reason,
          refundAmountCents: order.amountCents,
          cardLast4,
        });
        await sendRefundIssuedEmail({
          order: fresh,
          user: fresh.user,
          refundAmountCents: order.amountCents,
          reason,
          cardLast4,
        });
      }
    } catch (refundErr) {
      logStripe.fatal(
        { err: refundErr, sinaliteErr: err, orderId: order.id, intentId: intent.id },
        'CRITICAL: refund failed after Sinalite failure — manual intervention needed',
      );
      await markOrderFailed({
        orderId: order.id,
        reason: 'Sinalite failed AND refund failed — manual intervention needed',
        data: {
          sinaliteError: err instanceof Error ? err.message : 'unknown',
          refundError: refundErr instanceof Error ? refundErr.message : 'unknown',
        },
      });
      // Slack alert — pire scénario : customer chargé mais commande pas
      // créée chez Sinalite ET le refund auto a foiré. Manual action requise
      // dans Stripe Dashboard pour rembourser le client.
      void sendCriticalAlert({
        severity: 'critical',
        title: 'Refund FAILED after Sinalite failure — manual intervention required',
        body:
          `Le client a été chargé mais on n'a pas pu créer la commande Sinalite NI rembourser via API. ` +
          `Action immédiate : ouvre Stripe Dashboard et rembourse manuellement, puis email le client.`,
        context: {
          orderId: order.id,
          paymentIntentId: intent.id,
          amountCents: order.amountCents,
          sinaliteError: err instanceof Error ? err.message : 'unknown',
          refundError: refundErr instanceof Error ? refundErr.message : 'unknown',
        },
        actionUrl: `/admin/orders/${order.id}`,
        actionLabel: 'Voir la commande',
      });
    }

    throw err;
  }
}

/** Best-effort extraction du last4 de la card. Stripe expand needed pour
 *  avoir charges[0].payment_method_details — sinon undefined. */
function extractCardLast4(intent: Stripe.PaymentIntent): string | undefined {
  // PaymentIntent expanded peut contenir charges.data[0]
  const charges = (intent as Stripe.PaymentIntent & {
    charges?: { data?: Array<{ payment_method_details?: { card?: { last4?: string } } }> };
  }).charges;
  return charges?.data?.[0]?.payment_method_details?.card?.last4;
}

async function handlePaymentFailed(
  intent: Stripe.PaymentIntent,
  ctx: { orderId?: string },
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { paymentIntentId: intent.id },
  });
  if (!order) {
    logStripe.info({ intentId: intent.id }, 'payment failed (no matching order)');
    return;
  }
  ctx.orderId = order.id;
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
