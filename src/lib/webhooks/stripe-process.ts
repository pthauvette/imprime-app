/**
 * Logique business du webhook Stripe — extraite de la route handler pour
 * pouvoir être appelée à la fois par :
 *   - POST /api/webhooks/stripe (flow normal, après signature + dedup)
 *   - POST /api/admin/webhooks/[id]/replay (replay manuel par admin)
 *
 * Next.js 16 App Router interdit les named exports custom dans route.ts —
 * d'où le fichier séparé en /lib. La route ne fait plus que signature
 * verification + dedup + appel à `processStripeEvent`.
 *
 * Side-effects :
 *   - markOrderPaid/Submitted/Failed
 *   - sinalite.createOrder (POST externe)
 *   - stripe.refunds.create (POST externe)
 *   - sendOrderConfirmationEmail, sendOrderCancelledEmail, sendRefundIssuedEmail
 *   - sendCriticalAlert (Slack)
 *   - awardReferralCreditIfEligible (best-effort)
 */

import Stripe from 'stripe';
import { sinalite } from '@/lib/sinalite/client';
import { SinaliteOrderRequest } from '@/lib/sinalite/types';
import { prisma } from '@/lib/db';
import {
  markOrderPaid,
  markOrderPaidWithWalletDebit,
  markOrderSubmitted,
  markOrderFailed,
  markRefundIssued,
  OrderNotFoundError,
} from '@/lib/db/orders';
import {
  sendOrderConfirmationEmail,
  sendOrderCancelledEmail,
  sendPaymentFailedEmail,
  sendRefundIssuedEmail,
} from '@/lib/emails/send';
import { logStripe } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

/**
 * Process a Stripe event (post-signature, post-dedup). Caller handles
 * outcome recording and HTTP response. This function routes by event type
 * and propagates errors.
 */
export async function processStripeEvent(
  event: Stripe.Event,
  ctx: { orderId?: string },
): Promise<void> {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent, ctx);
      break;
    }
    case 'payment_intent.payment_failed': {
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent, ctx);
      break;
    }
    case 'checkout.session.completed': {
      // Round 18 #1 — wallet topup via Stripe Checkout. Distinct des
      // payment_intent.succeeded car le wizard d'order utilise Payment
      // Intents direct alors que le topup utilise Checkout Sessions
      // (meilleur UX pour un montant variable + bonus visible).
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === 'wallet_topup') {
        // Round 22 #3 — subscription mode → store the sub ID on User
        // pour permettre cancel later. Le invoice.paid premier viendra
        // séparément et fera le crédit.
        if (session.mode === 'subscription' && session.subscription) {
          await handleWalletSubscriptionCreated(session);
        } else {
          // Mode 'payment' = one-shot topup, credit immediately
          await handleWalletTopup(session);
        }
      } else {
        logStripe.info({ sessionId: session.id, metadata: session.metadata }, 'checkout.session.completed without wallet_topup metadata — ignored');
      }
      break;
    }
    case 'invoice.paid': {
      // Round 22 #3 — recurring wallet topup. Stripe envoie invoice.paid
      // chaque mois quand la subscription est chargée. Le metadata est
      // copié depuis subscription_data.metadata (cf wallet/topup route).
      const invoice = event.data.object as Stripe.Invoice;
      const subId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;
      if (subId && invoice.metadata?.kind === 'wallet_topup') {
        await handleWalletRecurringInvoice(invoice);
      } else if (subId) {
        // Invoice paid pour une subscription qui n'est PAS un wallet topup
        // (jamais le cas actuellement, mais defensive). Log et ignore.
        logStripe.info({ invoiceId: invoice.id, subId }, 'invoice.paid pour sub non-wallet — ignored');
      }
      break;
    }
    case 'customer.subscription.deleted': {
      // Round 22 #3 — user a cancel (ou expiration after cancel_at_period_end).
      // Nullify les fields wallet auto-renew côté DB.
      const sub = event.data.object as Stripe.Subscription;
      await handleWalletSubscriptionDeleted(sub);
      break;
    }
    default:
      logStripe.info({ eventType: event.type }, 'unhandled event');
  }
}

async function handleWalletSubscriptionCreated(session: Stripe.Checkout.Session): Promise<void> {
  const { prisma } = await import('@/lib/db');
  const meta = session.metadata ?? {};
  const userId = meta.userId;
  const amountCents = parseInt(meta.amountCents ?? '0', 10);
  const subId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;

  if (!userId || !subId || !amountCents) {
    throw new Error(`subscription session missing userId/subId/amountCents: ${JSON.stringify(meta)}`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      walletAutoRenewStripeSubId: subId,
      walletAutoRenewAmountCents: amountCents,
    },
  });
  logStripe.info({ userId, subId, amountCents }, 'wallet auto-renew subscription created');
  // Note : le invoice.paid premier viendra séparément (Stripe charge la
  // 1ère période immédiatement). On ne crédite pas ici pour éviter double-credit.
}

async function handleWalletRecurringInvoice(invoice: Stripe.Invoice): Promise<void> {
  const { processWalletTopup } = await import('@/lib/wallet/operations');
  const meta = invoice.metadata ?? {};
  const userId = meta.userId;
  const amountCents = parseInt(meta.amountCents ?? '0', 10);
  const bonusCents = parseInt(meta.bonusCents ?? '0', 10);
  const tierLabel = meta.tierLabel || null;

  if (!userId || !amountCents) {
    throw new Error(`invoice.paid metadata invalide : ${JSON.stringify(meta)}`);
  }

  // Idempotence : le invoice ID est unique Stripe-side, on l'utilise comme
  // paymentIntentId pour le WalletTransaction (le user a payé via cette invoice).
  const paymentIntentId = typeof invoice.payment_intent === 'string'
    ? invoice.payment_intent
    : invoice.payment_intent?.id ?? invoice.id;

  const result = await processWalletTopup({
    userId, amountCents, bonusCents, tierLabel,
    paymentIntentId,
  });
  logStripe.info({
    userId, amountCents, bonusCents,
    invoiceId: invoice.id,
    newBalance: result.balanceAfterCents,
  }, 'wallet recurring topup processed');
}

async function handleWalletSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const { prisma } = await import('@/lib/db');
  // Find user qui avait cette sub ID. Si déjà nullified (admin delete
  // route a déjà run), no-op.
  const user = await prisma.user.findFirst({
    where: { walletAutoRenewStripeSubId: sub.id },
    select: { id: true },
  });
  if (!user) {
    logStripe.info({ subId: sub.id }, 'subscription.deleted pour sub non-trackée — ignored');
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      walletAutoRenewStripeSubId: null,
      walletAutoRenewAmountCents: null,
    },
  });
  logStripe.info({ userId: user.id, subId: sub.id }, 'wallet auto-renew subscription deleted');
}

async function handleWalletTopup(session: Stripe.Checkout.Session): Promise<void> {
  const { processWalletTopup } = await import('@/lib/wallet/operations');
  const meta = session.metadata ?? {};
  const userId = meta.userId;
  const amountCents = parseInt(meta.amountCents ?? '0', 10);
  const bonusCents = parseInt(meta.bonusCents ?? '0', 10);
  const tierLabel = meta.tierLabel || null;
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? session.id;

  if (!userId || !amountCents) {
    throw new Error(`wallet_topup webhook missing userId or amountCents in metadata: ${JSON.stringify(meta)}`);
  }

  const result = await processWalletTopup({
    userId, amountCents, bonusCents, tierLabel,
    paymentIntentId,
  });
  logStripe.info({
    userId, amountCents, bonusCents,
    totalCredit: result.totalCreditCents,
    newBalance: result.balanceAfterCents,
  }, 'wallet topup processed');
}

async function handlePaymentSucceeded(
  intent: Stripe.PaymentIntent,
  ctx: { orderId?: string },
): Promise<void> {
  let order = await prisma.order.findUnique({
    where: { paymentIntentId: intent.id },
  });

  // Round 25 #5 — payment retry fallback. Si l'Order a été créée avec
  // un PI précédent qui a failed, le user a cliqué sur le retry link
  // → un nouveau PI a été créé avec metadata.orderId. On retrouve l'Order
  // par cet ID et on patch le paymentIntentId pour que les futurs events
  // (refund, etc) matchent. Idempotent : si on est déjà mis à jour
  // (replay du webhook), le lookup par paymentIntentId au-dessus aurait
  // succeed sans hitter ce fallback.
  if (!order && intent.metadata?.orderId) {
    const candidate = await prisma.order.findUnique({
      where: { id: intent.metadata.orderId },
    });
    if (candidate && (candidate.status === 'PENDING' || candidate.status === 'FAILED')) {
      // Patch le PI reference pour que markOrderPaid() ci-dessous puisse
      // match. Note : markOrderPaid lookups par paymentIntentId.
      order = await prisma.order.update({
        where: { id: candidate.id },
        data: {
          paymentIntentId: intent.id,
          // Reset status à PENDING si on retry depuis FAILED, pour que
          // le check status !== 'PENDING' ci-dessous ne bloque pas.
          ...(candidate.status === 'FAILED' && { status: 'PENDING' }),
        },
      });
      logStripe.info(
        { orderId: order.id, oldStatus: candidate.status, newIntentId: intent.id },
        'payment-retry: matched Order via intent.metadata.orderId fallback',
      );
    }
  }

  if (!order) {
    logStripe.error({ intentId: intent.id }, 'no Order for paymentIntent');
    return;
  }
  ctx.orderId = order.id;

  if (order.status !== 'PENDING') {
    logStripe.info({ orderId: order.id, status: order.status }, 'order already past PENDING');
    return;
  }

  // Round 36 #1 — wallet debit + mark paid maintenant DANS LA MÊME
  // $transaction. Avant : 2 transactions séparées → si le process crashait
  // entre les 2, l'order était PAID mais wallet pas débité = customer
  // paie Stripe ET garde son crédit (split-brain ledger).
  //
  // Maintenant : si le wallet debit échoue, le mark-paid rollback aussi.
  // Le webhook Stripe retry et tout repart d'un état cohérent.
  // L'idempotency reste assurée par le check order.status !== 'PENDING'
  // ci-dessus : si on a déjà fait le tour avec succès, on early-return.
  await markOrderPaidWithWalletDebit({
    paymentIntentId: intent.id,
    walletDebit: order.walletCreditAppliedCents > 0
      ? {
          userId: order.userId,
          amountCents: order.walletCreditAppliedCents,
          description: `Order #${order.sinaliteOrderId ?? order.id.slice(-6)} — wallet applied`,
        }
      : undefined,
  });

  // Best-effort referral credit award (idempotent via @unique on refereeUserId)
  try {
    const { awardReferralCreditIfEligible } = await import('@/lib/referrals/award');
    await awardReferralCreditIfEligible({ userId: order.userId, orderId: order.id });
  } catch (err) {
    logStripe.error({ err, orderId: order.id }, 'referral award threw (non-fatal)');
  }

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

    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      include: { user: true },
    });
    if (fresh) {
      await sendOrderConfirmationEmail({ order: fresh, user: fresh.user });
    }
  } catch (err) {
    logStripe.error({ err, orderId: order.id, intentId: intent.id }, 'Sinalite createOrder FAILED');

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

/** Best-effort extraction du last4 de la card via PaymentIntent expand. */
function extractCardLast4(intent: Stripe.PaymentIntent): string | undefined {
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
    include: { user: true },
  });
  if (!order) {
    logStripe.info({ intentId: intent.id }, 'payment failed (no matching order)');
    return;
  }
  ctx.orderId = order.id;
  const reason = intent.last_payment_error?.message ?? 'payment_failed';
  try {
    await markOrderFailed({
      orderId: order.id,
      reason,
      data: { code: intent.last_payment_error?.code },
    });
  } catch (err) {
    if (err instanceof OrderNotFoundError) return;
    throw err;
  }

  // Notify the customer — best-effort, transactional (pas d'opt-out check).
  // Sinon le user pense que sa commande est en production et appelle le
  // support 3 jours plus tard.
  try {
    await sendPaymentFailedEmail({
      order,
      user: order.user,
      failureReason: reason,
    });
  } catch (err) {
    logStripe.error(
      { err, orderId: order.id },
      'payment-failed email send failed (order already marked FAILED)',
    );
  }
}
