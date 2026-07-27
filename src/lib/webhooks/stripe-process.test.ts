import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ── Mocks des frontières du webhook ─────────────────────────────────────────
const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  orderEventCreate: vi.fn(),
  mcpIntentDeleteMany: vi.fn(),
  markOrderPaid: vi.fn(),
  markOrderPaidWithWalletDebit: vi.fn(),
  markOrderSubmitted: vi.fn(),
  markOrderFailed: vi.fn(),
  markRefundIssued: vi.fn(),
  createOrder: vi.fn(),
  sendOrderConfirmationEmail: vi.fn(),
  sendCriticalAlert: vi.fn(),
  awardReferral: vi.fn(),
  releaseReservedCreditsOnCancel: vi.fn(),
  refundsCreate: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: {
  order: { findUnique: m.findUnique, update: m.update, updateMany: m.updateMany },
  orderEvent: { create: m.orderEventCreate },
  mcpOrderIntent: { deleteMany: m.mcpIntentDeleteMany },
} }));
vi.mock('@/lib/db/orders', () => ({
  markOrderPaid: m.markOrderPaid,
  markOrderPaidWithWalletDebit: m.markOrderPaidWithWalletDebit,
  markOrderSubmitted: m.markOrderSubmitted,
  markOrderFailed: m.markOrderFailed,
  markRefundIssued: m.markRefundIssued,
  OrderNotFoundError: class OrderNotFoundError extends Error {},
}));
vi.mock('@/lib/emails/send', () => ({
  sendOrderConfirmationEmail: m.sendOrderConfirmationEmail,
  sendOrderCancelledEmail: vi.fn(),
  sendPaymentFailedEmail: vi.fn(),
  sendRefundIssuedEmail: vi.fn(),
}));
vi.mock('@/lib/sinalite/client', () => ({ sinalite: { createOrder: m.createOrder }, SinaliteError: class extends Error {} }));
vi.mock('@/lib/logger', () => ({ logStripe: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), fatal: vi.fn() } }));
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert: m.sendCriticalAlert }));
vi.mock('@/lib/stripe/client', () => ({ getStripe: () => ({ refunds: { create: m.refundsCreate } }) }));
vi.mock('@/lib/referrals/award', () => ({ awardReferralCreditIfEligible: m.awardReferral }));
vi.mock('@/lib/orders/credit-reservation', () => ({ releaseReservedCreditsOnCancel: m.releaseReservedCreditsOnCancel }));

import { processStripeEvent } from './stripe-process';

const VALID_PAYLOAD = {
  items: [{ productId: 2, options: { Stock: '30' }, files: [{ type: 'front', url: 'https://x.s3.amazonaws.com/uploads/a.pdf' }] }],
  shippingInfo: { ShipFName: 'A', ShipLName: 'B', ShipEmail: 'a@b.ca', ShipAddr: '1 rue', ShipAddr2: '', ShipCity: 'Mtl', ShipState: 'QC', ShipZip: 'H2X1Y7', ShipCountry: 'CA', ShipPhone: '5145551234', ShipMethod: 'UPS Standard' },
  billingInfo: { BillFName: 'A', BillLName: 'B', BillEmail: 'a@b.ca', BillAddr: '1 rue', BillAddr2: '', BillCity: 'Mtl', BillState: 'QC', BillZip: 'H2X1Y7', BillCountry: 'CA', BillPhone: '5145551234' },
};

function pendingOrder(amountCents: number, overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_1', paymentIntentId: 'pi_1', status: 'PENDING', amountCents,
    walletCreditAppliedCents: 0, userId: 'u1', sinaliteOrderId: null,
    sinalitePayload: JSON.stringify(VALID_PAYLOAD),
    user: { id: 'u1', email: 'owner@plio.ca', name: 'Owner' },
    ...overrides,
  };
}

function succeededEvent(amountReceived: number): Stripe.Event {
  return {
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_1', amount_received: amountReceived, metadata: {} } },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.createOrder.mockResolvedValue({ orderId: 999, message: 'ok', status: 'success' });
  // Par défaut, cet appel GAGNE la transition atomique PENDING→PAID.
  m.markOrderPaidWithWalletDebit.mockResolvedValue({ order: { id: 'ord_1' }, transitioned: true });
});

describe('webhook payment_intent.succeeded — garde montant (C1)', () => {
  it('montant encaissé == montant dû → finalise (pas de faux positif)', async () => {
    m.findUnique.mockResolvedValue(pendingOrder(5000));
    await processStripeEvent(succeededEvent(5000), {});
    expect(m.markOrderPaidWithWalletDebit).toHaveBeenCalledTimes(1);
    expect(m.createOrder).toHaveBeenCalledTimes(1); // soumis à Sinalite
    expect(m.sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('montant encaissé < montant dû → THROW + AUCUNE finalisation + alerte', async () => {
    m.findUnique.mockResolvedValue(pendingOrder(5000));
    await expect(processStripeEvent(succeededEvent(3000), {})).rejects.toThrow(/amount mismatch/);
    // La propriété de sécurité : on ne débite pas le wallet, on ne soumet pas à Sinalite.
    expect(m.markOrderPaidWithWalletDebit).not.toHaveBeenCalled();
    expect(m.createOrder).not.toHaveBeenCalled();
    expect(m.sendCriticalAlert).toHaveBeenCalledTimes(1);
  });

  it('montant encaissé > montant dû (surfacturation) → bloqué aussi', async () => {
    m.findUnique.mockResolvedValue(pendingOrder(5000));
    await expect(processStripeEvent(succeededEvent(9999), {})).rejects.toThrow(/amount mismatch/);
    expect(m.markOrderPaidWithWalletDebit).not.toHaveBeenCalled();
  });
});

describe('webhook payment_intent.succeeded — FAILLE D (charge orphelin M2/M3)', () => {
  it('Order ANNULÉE avant paiement (retry payé après le cron) → refund auto, pas de finalisation', async () => {
    // 1er findUnique (par PI) → null ; 2e (par metadata.orderId) → Order CANCELLED (cron l'a libérée).
    m.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ord_1', status: 'CANCELLED', userId: 'u1' });
    const event = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_new', amount_received: 3000, metadata: { orderId: 'ord_1' } } } } as unknown as Stripe.Event;
    await processStripeEvent(event, {});
    // Charge orphelin remboursé automatiquement (idempotent), AUCUNE commande finalisée.
    expect(m.refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_new' }),
      expect.objectContaining({ idempotencyKey: 'orphan_pi_new' }),
    );
    expect(m.markOrderPaidWithWalletDebit).not.toHaveBeenCalled();
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it('Order ANNULÉE + refund Stripe échoue → THROW (Stripe rejoue) + alerte critique (Audit 2026-07 #2)', async () => {
    m.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ord_1', status: 'CANCELLED', userId: 'u1' });
    m.refundsCreate.mockRejectedValueOnce(new Error('stripe 500 refund'));
    const event = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_x', amount_received: 3000, metadata: { orderId: 'ord_1' } } } } as unknown as Stripe.Event;
    // AVANT le fix : return silencieux (event 200, jamais rejoué). APRÈS : throw → Stripe retente.
    await expect(processStripeEvent(event, {})).rejects.toThrow(/stripe 500 refund/);
    expect(m.sendCriticalAlert).toHaveBeenCalledTimes(1);
    expect(m.markOrderPaidWithWalletDebit).not.toHaveBeenCalled();
  });
});

describe('webhook payment_intent.succeeded — DOUBLE-CHARGE sur retry (Order déjà payée, Audit 2026-07 #1)', () => {
  it('2e PI encaissé sur une Order déjà PAID → refund `dup_` auto, aucune finalisation', async () => {
    // 1er findUnique (par PI) → null (ce PI n'est pas celui enregistré) ; 2e (par
    // metadata.orderId) → Order déjà PAID par un AUTRE PI. Ce charge est un doublon.
    m.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ord_1', status: 'PAID', userId: 'u1' });
    const event = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_dup', amount_received: 5000, metadata: { orderId: 'ord_1' } } } } as unknown as Stripe.Event;
    await processStripeEvent(event, {});
    expect(m.refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_dup', reason: 'duplicate' }),
      expect.objectContaining({ idempotencyKey: 'dup_pi_dup' }),
    );
    // La commande déjà finalisée n'est PAS retouchée (aucune double-production Sinalite).
    expect(m.markOrderPaidWithWalletDebit).not.toHaveBeenCalled();
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it('catch-all des états payés : Order IN_PRODUCTION → refund `dup_` aussi', async () => {
    m.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ord_1', status: 'IN_PRODUCTION', userId: 'u1' });
    const event = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_dup2', amount_received: 5000, metadata: { orderId: 'ord_1' } } } } as unknown as Stripe.Event;
    await processStripeEvent(event, {});
    expect(m.refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_dup2', reason: 'duplicate' }),
      expect.objectContaining({ idempotencyKey: 'dup_pi_dup2' }),
    );
  });

  it('double-charge + refund échoue → THROW (Stripe rejoue) + alerte critique', async () => {
    m.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'ord_1', status: 'PAID', userId: 'u1' });
    m.refundsCreate.mockRejectedValueOnce(new Error('stripe boom dup'));
    const event = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_dup3', amount_received: 5000, metadata: { orderId: 'ord_1' } } } } as unknown as Stripe.Event;
    await expect(processStripeEvent(event, {})).rejects.toThrow(/stripe boom dup/);
    expect(m.sendCriticalAlert).toHaveBeenCalledTimes(1);
  });
});

describe('webhook payment_intent.succeeded — garde transitioned (#3a, anti double-production)', () => {
  it('event qui GAGNE la transition (transitioned=true) → soumet à Sinalite', async () => {
    m.findUnique.mockResolvedValue(pendingOrder(5000));
    m.markOrderPaidWithWalletDebit.mockResolvedValue({ order: { id: 'ord_1' }, transitioned: true });
    await processStripeEvent(succeededEvent(5000), {});
    expect(m.createOrder).toHaveBeenCalledTimes(1);
  });

  it('event concurrent qui PERD la course (transitioned=false) → AUCUNE soumission Sinalite ni referral', async () => {
    m.findUnique.mockResolvedValue(pendingOrder(5000));
    // L'updateMany atomique a déjà été gagné par l'autre event → count=0 → false.
    m.markOrderPaidWithWalletDebit.mockResolvedValue({ order: { id: 'ord_1' }, transitioned: false });
    await processStripeEvent(succeededEvent(5000), {});
    expect(m.markOrderPaidWithWalletDebit).toHaveBeenCalledTimes(1); // l'appel a bien eu lieu
    expect(m.createOrder).not.toHaveBeenCalled(); // mais PAS de double production
    expect(m.awardReferral).not.toHaveBeenCalled();
    expect(m.sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });
});

describe('webhook payment_intent.succeeded — finding [129] devis sur mesure (skipSinaliteSubmission)', () => {
  it('order.skipSinaliteSubmission=true → PAS de soumission Sinalite, mais confirmation envoyée', async () => {
    m.findUnique.mockResolvedValue(pendingOrder(5000, { skipSinaliteSubmission: true }));
    await processStripeEvent(succeededEvent(5000), {});
    expect(m.markOrderPaidWithWalletDebit).toHaveBeenCalledTimes(1);
    expect(m.createOrder).not.toHaveBeenCalled(); // JAMAIS soumis à Sinalite
    expect(m.sendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(m.sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('order.skipSinaliteSubmission=false (défaut) → soumission Sinalite normale (non-régression)', async () => {
    m.findUnique.mockResolvedValue(pendingOrder(5000, { skipSinaliteSubmission: false }));
    await processStripeEvent(succeededEvent(5000), {});
    expect(m.createOrder).toHaveBeenCalledTimes(1);
  });

  it('garde montant reste active même avec skipSinaliteSubmission=true (C1 non contourné)', async () => {
    m.findUnique.mockResolvedValue(pendingOrder(5000, { skipSinaliteSubmission: true }));
    await expect(processStripeEvent(succeededEvent(3000), {})).rejects.toThrow(/amount mismatch/);
    expect(m.markOrderPaidWithWalletDebit).not.toHaveBeenCalled();
    expect(m.sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });
});

function expiredEvent(metadata: Record<string, string>): Stripe.Event {
  return {
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_1', metadata } },
  } as unknown as Stripe.Event;
}

describe('webhook checkout.session.expired — Mode B (#3b)', () => {
  it('session Mode B expirée, Order encore PENDING → release crédits + event + libère le claim', async () => {
    // M2/M3 — releaseReservedCreditsOnCancel fait la transition PENDING→CANCELLED + restore.
    m.releaseReservedCreditsOnCancel.mockResolvedValue({ released: true, walletCents: 0, referralCents: 0 });
    await processStripeEvent(expiredEvent({ kind: 'mcp-order', orderId: 'ord_1' }), {});
    expect(m.releaseReservedCreditsOnCancel).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'ord_1' }));
    expect(m.orderEventCreate).toHaveBeenCalledTimes(1);
    expect(m.mcpIntentDeleteMany).toHaveBeenCalledWith({ where: { orderId: 'ord_1' } });
  });

  it('session Mode B expirée mais Order plus PENDING (payée entre-temps, released=false) → ne touche à rien', async () => {
    m.releaseReservedCreditsOnCancel.mockResolvedValue({ released: false, walletCents: 0, referralCents: 0 });
    await processStripeEvent(expiredEvent({ kind: 'mcp-order', orderId: 'ord_1' }), {});
    expect(m.orderEventCreate).not.toHaveBeenCalled();
    expect(m.mcpIntentDeleteMany).not.toHaveBeenCalled();
  });

  it('session NON-Mode-B (wallet_topup) expirée → ignorée (aucune annulation d\'Order)', async () => {
    await processStripeEvent(expiredEvent({ kind: 'wallet_topup', userId: 'u1' }), {});
    expect(m.releaseReservedCreditsOnCancel).not.toHaveBeenCalled();
  });
});
