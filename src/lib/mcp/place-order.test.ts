import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks des frontières I/O ────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  isHeadlessOrderEnabled: vi.fn(() => true),
  createMcpCheckoutSession: vi.fn(),
  assertPlioFileUrl: vi.fn((u: string): { ok: boolean; url?: string; reason?: string } => ({ ok: true, url: u })),
  resolveOrderItem: vi.fn(),
  getProductDetail: vi.fn(async () => ({ options: [], pricing: [], metadata: [] })),
  deriveIdempKey: vi.fn(() => 'idemphash'),
  claimMcpOrderIntent: vi.fn(),
  attachOrderToIntent: vi.fn(),
  completeMcpOrderIntent: vi.fn(),
  releaseMcpOrderIntent: vi.fn(),
  reestimateShipping: vi.fn(),
  selectShippingMethod: vi.fn(),
  priceOrder: vi.fn(),
  buildMcpSinalitePayload: vi.fn(() => ({ items: [], shippingInfo: {}, billingInfo: {} })),
  buildItemsSnapshot: vi.fn(() => []),
  createPendingOrder: vi.fn(),
  userFindUnique: vi.fn(),
  orderCount: vi.fn(async () => 0),
  rateLimit: vi.fn(async (): Promise<{ ok: boolean; remaining?: number; response?: unknown }> => ({ ok: true, remaining: 9 })),
}));
vi.mock('./checkout-session', () => ({ isHeadlessOrderEnabled: h.isHeadlessOrderEnabled, createMcpCheckoutSession: h.createMcpCheckoutSession }));
vi.mock('./file-url-guard', () => ({ assertPlioFileUrl: h.assertPlioFileUrl }));
vi.mock('./tools/create-order', () => ({ resolveOrderItem: h.resolveOrderItem }));
vi.mock('@/lib/sinalite/client', () => ({ sinalite: { getProductDetail: h.getProductDetail }, SinaliteError: class extends Error {} }));
vi.mock('./order-intent', () => ({ deriveIdempKey: h.deriveIdempKey, claimMcpOrderIntent: h.claimMcpOrderIntent, attachOrderToIntent: h.attachOrderToIntent, completeMcpOrderIntent: h.completeMcpOrderIntent, releaseMcpOrderIntent: h.releaseMcpOrderIntent }));
vi.mock('./tools/shipping', () => ({ reestimateShipping: h.reestimateShipping, selectShippingMethod: h.selectShippingMethod }));
vi.mock('@/lib/orders/price-order', () => ({ priceOrder: h.priceOrder }));
vi.mock('./sinalite-payload', () => ({ buildMcpSinalitePayload: h.buildMcpSinalitePayload }));
vi.mock('@/lib/orders/items', () => ({ buildItemsSnapshot: h.buildItemsSnapshot }));
vi.mock('@/lib/db/orders', () => ({ createPendingOrder: h.createPendingOrder }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: h.userFindUnique }, order: { count: h.orderCount } } }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: h.rateLimit, rateLimitEnabled: true }));
vi.mock('@/lib/logger', () => ({ logAuth: { warn: vi.fn(), error: vi.fn() } }));

import { placeHeadlessOrder } from './place-order';

const ARGS = {
  items: [{ slug: 'cartes-de-visite', paper: '14pt', finish: 'aq', quantity: 500, fileUrl: 'https://plio-uploads.s3.ca-central-1.amazonaws.com/uploads/u1/a.pdf' }],
  contact: { firstName: 'Jean', lastName: 'T', email: 'ship@x.ca', phone: '5145551234' },
  shippingAddress: { line1: '1 rue', city: 'Mtl', province: 'QC' as const, postalCode: 'H2X1Y7' },
  shippingMethod: 'UPS Standard' as const,
  expectedGrossCents: 5000,
  idempotencyKey: 'nonce-stable-123',
};
const USER = { userId: 'u1' };

function happyMocks() {
  h.isHeadlessOrderEnabled.mockReturnValue(true);
  h.assertPlioFileUrl.mockReturnValue({ ok: true, url: ARGS.items[0].fileUrl });
  h.resolveOrderItem.mockResolvedValue({ ok: true, productId: 2, optionIds: [5, 30], name: 'Carte', slug: 'cartes-de-visite', paper: '14pt', finish: 'aq', quantity: 500, subtotalCents: 2190, uploadUrl: 'x' });
  h.claimMcpOrderIntent.mockResolvedValue({ status: 'new' });
  h.rateLimit.mockResolvedValue({ ok: true, remaining: 9 });
  h.reestimateShipping.mockResolvedValue({ ok: true, methods: [{ carrier: 'UPS', method: 'UPS Standard', price: 16.66, days: 4, sig: 's' }], cheapest: {} });
  h.selectShippingMethod.mockReturnValue({ carrier: 'UPS', method: 'UPS Standard', price: 16.66, days: 4, sig: 's' });
  h.userFindUnique.mockResolvedValue({ email: 'owner@plio.ca', loyaltyTier: null, referralCreditCents: 0, walletCents: 0, taxExempt: false, resellerStatus: 'NONE' });
  h.priceOrder.mockResolvedValue({ ok: true, subtotal: 21.9, discountAmount: 0, resellerDiscountAmount: 0, effectiveShippingPrice: 16.66, goldFreeShippingApplied: false, tax: { lines: [], total: 5.79, combinedRate: 0.15 }, grossTotalCents: 5000, walletCreditApplied: 0, referralCreditApplied: 0, totalCents: 5000, promoRecord: null, detailCache: new Map(), productNames: new Map(), productSummary: 'Carte' });
  h.createPendingOrder.mockResolvedValue({ id: 'ord_1' });
  h.createMcpCheckoutSession.mockResolvedValue({ sessionId: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
}

beforeEach(() => { vi.clearAllMocks(); happyMocks(); });

describe('placeHeadlessOrder', () => {
  it('flag OFF → refus (oriente vers Mode A)', async () => {
    h.isHeadlessOrderEnabled.mockReturnValue(false);
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
    expect(h.createPendingOrder).not.toHaveBeenCalled();
  });

  it('happy path → Order + Checkout Session, customer = email COMPTE, montant = recompute serveur', async () => {
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.orderId).toBe('ord_1');
    expect(r.checkoutUrl).toContain('checkout.stripe.com');
    // Order créé avec le montant recomputé + placeholder PI mcp_.
    const od = h.createPendingOrder.mock.calls[0]![0];
    expect(od.amountCents).toBe(5000);
    expect(od.paymentIntentId).toMatch(/^mcp_/);
    // Session : email du COMPTE (jamais contact.email).
    expect(h.createMcpCheckoutSession.mock.calls[0]![0].customerEmail).toBe('owner@plio.ca');
    // Port = prix SERVEUR ré-estimé (16.66), pas un prix agent.
    expect(h.priceOrder.mock.calls[0]![0].shippingPrice).toBe(16.66);
    // Idempotence : orderId attaché AVANT, complété APRÈS.
    expect(h.attachOrderToIntent).toHaveBeenCalledWith('u1', 'idemphash', 'ord_1');
    expect(h.completeMcpOrderIntent).toHaveBeenCalledWith('u1', 'idemphash', 'ord_1', r.checkoutUrl);
  });

  it('idempotence : claim déjà COMPLÉTÉ → renvoie le 1er résultat, PAS de 2e Order', async () => {
    h.claimMcpOrderIntent.mockResolvedValue({ status: 'completed', orderId: 'ord_old', checkoutUrl: 'https://old' });
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.orderId).toBe('ord_old'); expect(r.replay).toBe(true); }
    expect(h.createPendingOrder).not.toHaveBeenCalled();
  });

  it('idempotence : claim PENDING (concurrent) → message « en cours », pas de 2e Order', async () => {
    h.claimMcpOrderIntent.mockResolvedValue({ status: 'pending', orderId: null });
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
    expect(h.createPendingOrder).not.toHaveBeenCalled();
  });

  it('expectedGross divergent → refus (le débit reste le recompute serveur)', async () => {
    const r = await placeHeadlessOrder({ ...ARGS, expectedGrossCents: 9999 }, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
    expect(h.createPendingOrder).not.toHaveBeenCalled();
  });

  it('montant > plafond → refus', async () => {
    h.priceOrder.mockResolvedValue({ ...(await h.priceOrder()), ok: true, grossTotalCents: 600_000, totalCents: 600_000 });
    const r = await placeHeadlessOrder({ ...ARGS, expectedGrossCents: 600_000 }, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
  });

  it('rate-limit user dépassé → refus + RELÂCHE le claim (pas d\'empoisonnement)', async () => {
    h.rateLimit.mockResolvedValueOnce({ ok: false, response: {} });
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
    expect(h.releaseMcpOrderIntent).toHaveBeenCalledWith('u1', 'idemphash');
    expect(h.createPendingOrder).not.toHaveBeenCalled();
  });

  it('fileUrl refusé (hors bucket Plio) → refus AVANT toute écriture', async () => {
    h.assertPlioFileUrl.mockReturnValue({ ok: false, reason: 'host externe' });
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
    expect(h.claimMcpOrderIntent).not.toHaveBeenCalled();
  });

  it('méthode de livraison introuvable dans la ré-estimation → refus', async () => {
    h.selectShippingMethod.mockReturnValue(null);
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
    expect(h.createPendingOrder).not.toHaveBeenCalled();
  });
});
