/**
 * Tests pour POST /api/webhooks/stripe — money path critique.
 *
 * Couvre : signature, idempotence, happy-path payment_intent.succeeded,
 * Sinalite failure → auto-refund, refund-also-fails → manual intervention,
 * payment_intent.payment_failed.
 *
 * Tous les helpers DB/Stripe/Sinalite/email sont mockés ; on teste la
 * choreography du handler, pas les IO sous-jacentes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Order, User } from '@prisma/client';

// ─── Stripe SDK mock ─────────────────────────────────────────────────────────
// Le route module fait `new Stripe(...)` au load — on intercepte le constructor
// pour pouvoir per-test set up constructEvent / refunds.create.
// Use vi.hoisted so stripeInstance is available inside the factory (which
// runs before regular module code due to vi.mock hoisting).
const { stripeInstance } = vi.hoisted(() => ({
  stripeInstance: {
    webhooks: { constructEvent: vi.fn() },
    refunds: { create: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
}));
vi.mock('stripe', () => {
  function StripeMock(this: unknown) {
    return stripeInstance;
  }
  return { default: StripeMock };
});

// ─── Helpers DB ──────────────────────────────────────────────────────────────
vi.mock('@/lib/db/orders', () => {
  class OrderNotFoundError extends Error {
    constructor(key: string) {
      super(`Order not found: ${key}`);
      this.name = 'OrderNotFoundError';
    }
  }
  return {
    markOrderPaid: vi.fn(async () => undefined),
    // Round 36 #1 — nouveau helper atomic combinant mark-paid + wallet debit
    markOrderPaidWithWalletDebit: vi.fn(async () => ({ id: 'o_mock', status: 'PAID' })),
    markOrderSubmitted: vi.fn(async () => undefined),
    markOrderFailed: vi.fn(async () => undefined),
    markRefundIssued: vi.fn(async () => undefined),
    recordWebhookEvent: vi.fn(async () => ({ isNew: true, alreadyCompleted: false })),
    updateWebhookOutcome: vi.fn(async () => undefined),
    OrderNotFoundError,
  };
});

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findUnique: vi.fn() },
  },
}));

// ─── Sinalite client + types ─────────────────────────────────────────────────
vi.mock('@/lib/sinalite/client', () => ({
  sinalite: { createOrder: vi.fn() },
}));

vi.mock('@/lib/sinalite/types', () => ({
  // Le route parse SinaliteOrderRequest.parse(JSON.parse(order.sinalitePayload)) —
  // on remplace par un passthrough qui accepte n'importe quoi.
  SinaliteOrderRequest: { parse: vi.fn((x: unknown) => x) },
}));

// ─── Emails ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/emails/send', () => ({
  sendOrderConfirmationEmail: vi.fn(async () => ({ sent: true })),
  sendOrderCancelledEmail: vi.fn(async () => ({ sent: true })),
  sendRefundIssuedEmail: vi.fn(async () => ({ sent: true })),
  sendOrderShippedEmail: vi.fn(async () => ({ sent: true })),
  sendOrderDeliveredEmail: vi.fn(async () => ({ sent: true })),
}));

// ─── Wallet operations ───────────────────────────────────────────────────────
// stripe-process importe (dynamiquement) processWalletTopup (invoice.paid) ET
// restoreWalletCreditOnFullRefund (refund path) — il faut les deux dans le mock,
// sinon le chemin refund casse (« No export … on the mock »).
vi.mock('@/lib/wallet/operations', () => ({
  processWalletTopup: vi.fn(async () => ({ totalCreditCents: 5500, balanceAfterCents: 5500 })),
  restoreWalletCreditOnFullRefund: vi.fn(async () => undefined),
}));

// ─── Logger : silencieux pour ne pas polluer les sorties test ────────────────
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = {
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    debug: noop,
    trace: noop,
    child: () => stub,
  };
  return {
    log: stub,
    logStripe: stub,
    logSinalite: stub,
    logAuth: stub,
    logEmail: stub,
    logS3: stub,
    logAdmin: stub,
    logWebhook: stub,
  };
});

// ─── Imports SUT après mocks ─────────────────────────────────────────────────
import { POST } from '@/app/api/webhooks/stripe/route';
import { processWalletTopup } from '@/lib/wallet/operations';
import * as orders from '@/lib/db/orders';
import { prisma } from '@/lib/db';
import { sinalite } from '@/lib/sinalite/client';
import * as emails from '@/lib/emails/send';
import { makeTestUser } from './factories/user';
import { makeTestOrder } from './factories/order';

// ─── Fixtures ────────────────────────────────────────────────────────────────
// Round 19 #1 — factory remplace inline fixture.
const baseUser: User = makeTestUser({
  id: 'user_1',
  email: 'buyer@plio.ca',
  name: 'Buyer One',
  firstName: 'Buyer',
  lastName: 'One',
});

// Round 21 #1 — factory replace inline fixture
const baseOrder: Order = makeTestOrder({
  id: 'order_1',
  userId: 'user_1',
  paymentIntentId: 'pi_test_123',
  paidAt: null,
  sinaliteOrderId: null,
  status: 'PENDING',
  sinalitePayload: JSON.stringify({ items: [{ productId: 1 }] }),
});

function makeStripeRequest(body: unknown = {}, headers: Record<string, string> = { 'stripe-signature': 't=1,v1=fake' }): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function paymentSucceededEvent(intentId = 'pi_test_123', extra: Record<string, unknown> = {}) {
  return {
    id: `evt_${intentId}`,
    type: 'payment_intent.succeeded' as const,
    data: { object: { id: intentId, ...extra } },
  };
}

function paymentFailedEvent(intentId = 'pi_test_123', extra: Record<string, unknown> = {}) {
  return {
    id: `evt_failed_${intentId}`,
    type: 'payment_intent.payment_failed' as const,
    data: { object: { id: intentId, ...extra } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to default success-path behaviors
  vi.mocked(orders.recordWebhookEvent).mockResolvedValue({ isNew: true, alreadyCompleted: false });
  vi.mocked(orders.markOrderPaid).mockResolvedValue(undefined as never);
  vi.mocked(orders.markOrderSubmitted).mockResolvedValue(undefined as never);
  vi.mocked(orders.markOrderFailed).mockResolvedValue(undefined as never);
  vi.mocked(orders.markRefundIssued).mockResolvedValue(undefined as never);
  vi.mocked(orders.updateWebhookOutcome).mockResolvedValue(undefined);
  vi.mocked(sinalite.createOrder).mockResolvedValue({ orderId: 48312 } as never);
  vi.mocked(stripeInstance.refunds.create).mockResolvedValue({ id: 're_test123' } as never);
});

// ─── A. Happy path ──────────────────────────────────────────────────────────
describe('A. payment_intent.succeeded — happy path', () => {
  it('records webhook, marks paid, submits to Sinalite, sends confirmation, updates outcome', async () => {
    const event = paymentSucceededEvent('pi_happy');
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(event as never);
    const order = { ...baseOrder, paymentIntentId: 'pi_happy' };
    vi.mocked(prisma.order.findUnique)
      // 1st call : lookup by paymentIntentId
      .mockResolvedValueOnce(order as never)
      // 2nd call : post-submit fetch with user joined
      .mockResolvedValueOnce({ ...order, sinaliteOrderId: '48312', user: baseUser } as never);

    const res = await POST(makeStripeRequest());

    expect(orders.recordWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'STRIPE',
        eventId: event.id,
        eventType: 'payment_intent.succeeded',
        payload: expect.any(String),
      }),
    );
    // Round 36 #1 — la production code utilise maintenant markOrderPaidWithWalletDebit
    // (qui combine mark-paid + wallet debit dans 1 tx atomique).
    expect(orders.markOrderPaidWithWalletDebit).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: 'pi_happy' }),
    );
    expect(sinalite.createOrder).toHaveBeenCalledTimes(1);
    expect(orders.markOrderSubmitted).toHaveBeenCalledWith({
      orderId: order.id,
      sinaliteOrderId: 48312,
    });
    expect(emails.sendOrderConfirmationEmail).toHaveBeenCalledWith({
      order: expect.objectContaining({ id: order.id, sinaliteOrderId: '48312' }),
      user: baseUser,
    });
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'STRIPE',
        eventId: event.id,
        success: true,
        statusCode: 200,
        orderId: order.id,
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });
});

// ─── B. Idempotence ─────────────────────────────────────────────────────────
describe('B. Idempotence — replay of same event.id', () => {
  it('short-circuits with deduped=true and does no work', async () => {
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(
      paymentSucceededEvent('pi_replay') as never,
    );
    vi.mocked(orders.recordWebhookEvent).mockResolvedValueOnce({ isNew: false, alreadyCompleted: true });

    const res = await POST(makeStripeRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, deduped: true });
    expect(orders.markOrderPaid).not.toHaveBeenCalled();
    expect(sinalite.createOrder).not.toHaveBeenCalled();
    expect(emails.sendOrderConfirmationEmail).not.toHaveBeenCalled();
    expect(orders.updateWebhookOutcome).not.toHaveBeenCalled();
  });

  // Audit v2 #2.2 — une tentative précédente ÉCHOUÉE (success=false →
  // alreadyCompleted=false) ne doit PAS être dédupliquée : le retry Stripe
  // doit re-traiter, sinon un échec transitoire neutralise le retry à jamais.
  it('prior failed attempt (alreadyCompleted=false) → REPROCESSES, no dedup', async () => {
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(
      paymentSucceededEvent('pi_retry_after_fail') as never,
    );
    vi.mocked(orders.recordWebhookEvent).mockResolvedValueOnce({ isNew: false, alreadyCompleted: false });
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { ...baseOrder, paymentIntentId: 'pi_retry_after_fail', status: 'PENDING' } as never,
    );

    const res = await POST(makeStripeRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    // re-traité : le handler a tourné (PENDING → PAID) + l'outcome est patché
    // (succès cette fois). C'est markOrderPaidWithWalletDebit qui porte le débit.
    expect(orders.markOrderPaidWithWalletDebit).toHaveBeenCalled();
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, statusCode: 200 }),
    );
  });
});

// ─── C. Order already past PENDING (race after escaped dedupe) ──────────────
describe('C. Order not PENDING (already PAID)', () => {
  it('returns early without re-marking or re-submitting', async () => {
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(
      paymentSucceededEvent('pi_already_paid') as never,
    );
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { ...baseOrder, paymentIntentId: 'pi_already_paid', status: 'PAID' } as never,
    );

    const res = await POST(makeStripeRequest());

    expect(orders.markOrderPaid).not.toHaveBeenCalled();
    expect(sinalite.createOrder).not.toHaveBeenCalled();
    expect(emails.sendOrderConfirmationEmail).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, statusCode: 200 }),
    );
  });
});

// ─── D. Sinalite failure → auto-refund ──────────────────────────────────────
describe('D. Sinalite failure → auto-refund (CRITICAL)', () => {
  it('refunds payment, marks failed, sends cancellation + refund emails, returns 500', async () => {
    const event = paymentSucceededEvent('pi_sinalite_fail');
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(event as never);
    const order = { ...baseOrder, paymentIntentId: 'pi_sinalite_fail' };
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce(order as never)
      // post-refund fresh fetch (with user joined) for emails
      .mockResolvedValueOnce({ ...order, user: baseUser } as never);
    vi.mocked(sinalite.createOrder).mockRejectedValueOnce(new Error('Sinalite 500: internal'));

    const res = await POST(makeStripeRequest());

    // Round 38 #3 — Stripe refunds.create maintenant appelé avec 2 args :
    // (body, { idempotencyKey }). Tests vérifie l'idempotency key inclut
    // l'intent.id pour dedupe sur retry webhook.
    expect(stripeInstance.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_sinalite_fail',
        reason: 'requested_by_customer',
        metadata: {
          reason: 'sinalite_creation_failed',
          orderId: order.id,
          error: 'Sinalite 500: internal',
        },
      },
      expect.objectContaining({
        idempotencyKey: expect.stringContaining('pi_sinalite_fail'),
      }),
    );
    expect(orders.markRefundIssued).toHaveBeenCalledWith({
      orderId: order.id,
      refundId: 're_test123',
    });
    expect(orders.markOrderFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: order.id,
        reason: 'Sinalite 500: internal',
        data: expect.objectContaining({ refundId: 're_test123' }),
      }),
    );
    expect(emails.sendOrderCancelledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        order: expect.objectContaining({ id: order.id }),
        user: baseUser,
        reason: 'Sinalite 500: internal',
        refundAmountCents: order.amountCents,
      }),
    );
    expect(emails.sendRefundIssuedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        order: expect.objectContaining({ id: order.id }),
        user: baseUser,
        refundAmountCents: order.amountCents,
        reason: 'Sinalite 500: internal',
      }),
    );
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 500,
        orderId: order.id,
      }),
    );
    expect(res.status).toBe(500);
  });
});

// ─── E. Refund-also-fails (CRITICAL CRITICAL) ───────────────────────────────
describe('E. Sinalite + refund both fail (CRITICAL CRITICAL)', () => {
  it('marks order failed with manual-intervention reason, still re-throws', async () => {
    const event = paymentSucceededEvent('pi_double_fail');
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(event as never);
    const order = { ...baseOrder, paymentIntentId: 'pi_double_fail' };
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(order as never);
    vi.mocked(sinalite.createOrder).mockRejectedValueOnce(new Error('Sinalite 500'));
    vi.mocked(stripeInstance.refunds.create).mockRejectedValueOnce(new Error('Stripe down'));

    const res = await POST(makeStripeRequest());

    expect(orders.markOrderFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: order.id,
        reason: expect.stringMatching(/manual intervention/i),
        data: expect.objectContaining({
          sinaliteError: 'Sinalite 500',
          refundError: 'Stripe down',
        }),
      }),
    );
    // No refund-issued / no customer emails in this branch (we couldn't refund)
    expect(orders.markRefundIssued).not.toHaveBeenCalled();
    expect(emails.sendOrderCancelledEmail).not.toHaveBeenCalled();
    expect(emails.sendRefundIssuedEmail).not.toHaveBeenCalled();
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, statusCode: 500, orderId: order.id }),
    );
    expect(res.status).toBe(500);
  });
});

// ─── F. Missing signature header ────────────────────────────────────────────
describe('F. Missing signature', () => {
  it('returns 400 and does NOT record webhook event', async () => {
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: {},
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Missing signature' });
    expect(orders.recordWebhookEvent).not.toHaveBeenCalled();
    expect(stripeInstance.webhooks.constructEvent).not.toHaveBeenCalled();
  });
});

// ─── G. Bad signature ───────────────────────────────────────────────────────
describe('G. Bad signature', () => {
  it('returns 400 and does NOT record webhook event', async () => {
    vi.mocked(stripeInstance.webhooks.constructEvent).mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    const res = await POST(makeStripeRequest());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid signature' });
    expect(orders.recordWebhookEvent).not.toHaveBeenCalled();
  });
});

// ─── H. payment_failed — no matching order ──────────────────────────────────
describe('H. payment_intent.payment_failed without matching order', () => {
  it('returns 200, does not call markOrderFailed', async () => {
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(
      paymentFailedEvent('pi_unknown') as never,
    );
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(null);

    const res = await POST(makeStripeRequest());

    expect(orders.markOrderFailed).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, statusCode: 200 }),
    );
  });
});

// ─── I. payment_failed — matching order → markOrderFailed ───────────────────
describe('I. payment_intent.payment_failed with matching order', () => {
  it('calls markOrderFailed with reason from last_payment_error.message', async () => {
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(
      paymentFailedEvent('pi_card_declined', {
        last_payment_error: { message: 'Your card was declined.', code: 'card_declined' },
      }) as never,
    );
    const order = { ...baseOrder, paymentIntentId: 'pi_card_declined' };
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(order as never);

    const res = await POST(makeStripeRequest());

    expect(orders.markOrderFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: order.id,
        reason: 'Your card was declined.',
        data: expect.objectContaining({ code: 'card_declined' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, orderId: order.id }),
    );
  });
});

// ─── F. invoice.paid — wallet auto-renew (audit-vérif H1) ────────────────────
// Régression : la metadata wallet_topup vit sur la SUBSCRIPTION, pas sur
// l'invoice (Stripe ne la recopie pas). On vérifie qu'on la lit bien via
// subscriptions.retrieve → le wallet est crédité (avant : jamais crédité).
function invoicePaidEvent(subId = 'sub_test_1', extra: Record<string, unknown> = {}) {
  return {
    id: `evt_inv_${subId}`,
    type: 'invoice.paid' as const,
    data: {
      object: {
        id: `in_${subId}`,
        subscription: subId,
        payment_intent: `pi_inv_${subId}`,
        metadata: {}, // VIDE : Stripe ne copie pas subscription_data.metadata ici
        ...extra,
      },
    },
  };
}

describe('F. invoice.paid — wallet auto-renew (H1)', () => {
  it('crédite le wallet en lisant la metadata de la SUBSCRIPTION (invoice.metadata est vide)', async () => {
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(invoicePaidEvent('sub_1') as never);
    vi.mocked(stripeInstance.subscriptions.retrieve).mockResolvedValueOnce({
      metadata: { kind: 'wallet_topup', userId: 'user_1', amountCents: '5000', bonusCents: '500', tierLabel: 'Or' },
    } as never);

    const res = await POST(makeStripeRequest());
    expect(res.status).toBe(200);

    // la metadata vient bien de la subscription (pas de l'invoice, vide)
    expect(stripeInstance.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
    expect(processWalletTopup).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        amountCents: 5000,
        bonusCents: 500,
        tierLabel: 'Or',
        paymentIntentId: 'pi_inv_sub_1',
      }),
    );
  });

  it('subscription qui n\'est PAS un wallet topup → ne crédite rien', async () => {
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(invoicePaidEvent('sub_2') as never);
    vi.mocked(stripeInstance.subscriptions.retrieve).mockResolvedValueOnce({
      metadata: { kind: 'autre_chose' },
    } as never);

    const res = await POST(makeStripeRequest());
    expect(res.status).toBe(200);
    expect(processWalletTopup).not.toHaveBeenCalled();
  });

  it('invoice sans subscription → ignorée, aucun crédit', async () => {
    vi.mocked(stripeInstance.webhooks.constructEvent).mockReturnValueOnce(
      invoicePaidEvent('sub_3', { subscription: null }) as never,
    );

    const res = await POST(makeStripeRequest());
    expect(res.status).toBe(200);
    expect(stripeInstance.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(processWalletTopup).not.toHaveBeenCalled();
  });
});
