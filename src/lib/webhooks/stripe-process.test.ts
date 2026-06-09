import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ── Mocks des frontières du webhook ─────────────────────────────────────────
const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  markOrderPaid: vi.fn(),
  markOrderPaidWithWalletDebit: vi.fn(),
  markOrderSubmitted: vi.fn(),
  markOrderFailed: vi.fn(),
  markRefundIssued: vi.fn(),
  createOrder: vi.fn(),
  sendOrderConfirmationEmail: vi.fn(),
  sendCriticalAlert: vi.fn(),
  awardReferral: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: { order: { findUnique: m.findUnique, update: m.update } } }));
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
vi.mock('@/lib/stripe/client', () => ({ getStripe: () => ({}) }));
vi.mock('@/lib/referrals/award', () => ({ awardReferralCreditIfEligible: m.awardReferral }));

import { processStripeEvent } from './stripe-process';

const VALID_PAYLOAD = {
  items: [{ productId: 2, options: { Stock: '30' }, files: [{ type: 'front', url: 'https://x.s3.amazonaws.com/uploads/a.pdf' }] }],
  shippingInfo: { ShipFName: 'A', ShipLName: 'B', ShipEmail: 'a@b.ca', ShipAddr: '1 rue', ShipAddr2: '', ShipCity: 'Mtl', ShipState: 'QC', ShipZip: 'H2X1Y7', ShipCountry: 'CA', ShipPhone: '5145551234', ShipMethod: 'UPS Standard' },
  billingInfo: { BillFName: 'A', BillLName: 'B', BillEmail: 'a@b.ca', BillAddr: '1 rue', BillAddr2: '', BillCity: 'Mtl', BillState: 'QC', BillZip: 'H2X1Y7', BillCountry: 'CA', BillPhone: '5145551234' },
};

function pendingOrder(amountCents: number) {
  return {
    id: 'ord_1', paymentIntentId: 'pi_1', status: 'PENDING', amountCents,
    walletCreditAppliedCents: 0, userId: 'u1', sinaliteOrderId: null,
    sinalitePayload: JSON.stringify(VALID_PAYLOAD),
    user: { id: 'u1', email: 'owner@plio.ca', name: 'Owner' },
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
