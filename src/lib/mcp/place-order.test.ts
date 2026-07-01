import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  createReservedOrder: vi.fn(),
  InsufficientCreditError: class InsufficientCreditError extends Error {},
  userFindUnique: vi.fn(),
  orderCount: vi.fn(async () => 0),
  rateLimit: vi.fn(async (): Promise<{ ok: boolean; remaining?: number; response?: unknown }> => ({ ok: true, remaining: 9 })),
  revalidatePrintFiles: vi.fn(async (): Promise<unknown[]> => []),
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
vi.mock('@/lib/orders/credit-reservation', () => ({ createReservedOrder: h.createReservedOrder, InsufficientCreditError: h.InsufficientCreditError }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: h.userFindUnique }, order: { count: h.orderCount } } }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: h.rateLimit, rateLimitEnabled: true }));
vi.mock('@/lib/orders/revalidate-files', () => ({ revalidatePrintFiles: h.revalidatePrintFiles }));
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
  h.createReservedOrder.mockResolvedValue({ order: { id: 'ord_1' }, replay: false });
  h.createMcpCheckoutSession.mockResolvedValue({ sessionId: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
  // Préflight fichier (#6) : par défaut, fichier conforme → non bloquant.
  h.revalidatePrintFiles.mockResolvedValue([{ url: ARGS.items[0].fileUrl, productId: 2, level: 'ok', blocking: false, issues: [] }]);
}

beforeEach(() => { vi.clearAllMocks(); happyMocks(); });

describe('placeHeadlessOrder', () => {
  it('flag OFF → refus (oriente vers Mode A)', async () => {
    h.isHeadlessOrderEnabled.mockReturnValue(false);
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
    expect(h.createReservedOrder).not.toHaveBeenCalled();
  });

  it('happy path → Order + Checkout Session, customer = email COMPTE, montant = recompute serveur', async () => {
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.orderId).toBe('ord_1');
    expect(r.checkoutUrl).toContain('checkout.stripe.com');
    // Order créé avec le montant recomputé + placeholder PI mcp_.
    const od = h.createReservedOrder.mock.calls[0]![0];
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

  it('M2/M3 — solde crédit insuffisant (concurrent) → err + claim RELÂCHÉ, pas de Session', async () => {
    h.createReservedOrder.mockRejectedValueOnce(new h.InsufficientCreditError('wallet'));
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
    // Aucun Order créé (tx rollback) → on relâche le claim pour re-claimable.
    expect(h.releaseMcpOrderIntent).toHaveBeenCalledWith('u1', 'idemphash');
    expect(h.createMcpCheckoutSession).not.toHaveBeenCalled();
  });

  it('idempotence : claim déjà COMPLÉTÉ → renvoie le 1er résultat, PAS de 2e Order', async () => {
    h.claimMcpOrderIntent.mockResolvedValue({ status: 'completed', orderId: 'ord_old', checkoutUrl: 'https://old' });
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.orderId).toBe('ord_old'); expect(r.replay).toBe(true); }
    expect(h.createReservedOrder).not.toHaveBeenCalled();
  });

  it('idempotence : claim PENDING (concurrent) → message « en cours », pas de 2e Order', async () => {
    h.claimMcpOrderIntent.mockResolvedValue({ status: 'pending', orderId: null });
    const r = await placeHeadlessOrder(ARGS, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
    expect(h.createReservedOrder).not.toHaveBeenCalled();
  });

  it('expectedGross divergent → refus (le débit reste le recompute serveur)', async () => {
    const r = await placeHeadlessOrder({ ...ARGS, expectedGrossCents: 9999 }, USER, 1_780_000_000_000);
    expect(r.ok).toBe(false);
    expect(h.createReservedOrder).not.toHaveBeenCalled();
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
    expect(h.createReservedOrder).not.toHaveBeenCalled();
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
    expect(h.createReservedOrder).not.toHaveBeenCalled();
  });
});

const NOW = 1_780_000_000_000;
const okOutcome = (url: string, productId = 2) => ({ url, productId, level: 'ok' as const, blocking: false, issues: [] });
const blockOutcome = (url: string, code = 'pdf-invalid', productId = 2) => ({
  url, productId, level: 'error' as const, blocking: true, issues: [{ level: 'error' as const, code, message: 'x' }],
});

describe('placeHeadlessOrder — préflight fichier (audit #6)', () => {
  it('fichier conforme → commande créée + helper appelé avec le mapping resolved→{productId,files}', async () => {
    const r = await placeHeadlessOrder(ARGS, USER, NOW);
    expect(r.ok).toBe(true);
    expect(h.createReservedOrder).toHaveBeenCalled();
    expect(h.revalidatePrintFiles).toHaveBeenCalledWith([{ productId: 2, files: [{ url: ARGS.items[0].fileUrl }] }]);
  });

  it('PDF corrompu (blocking) → refus, AUCUN Order/Session, claim RELÂCHÉ (placement après rate-limit)', async () => {
    h.revalidatePrintFiles.mockResolvedValue([blockOutcome(ARGS.items[0].fileUrl)]);
    const r = await placeHeadlessOrder(ARGS, USER, NOW);
    expect(r.ok).toBe(false);
    expect(h.createReservedOrder).not.toHaveBeenCalled();
    expect(h.createMcpCheckoutSession).not.toHaveBeenCalled();
    // Le claim a été pris (placement après rate-limit) PUIS relâché → pas d'empoisonnement.
    expect(h.claimMcpOrderIntent).toHaveBeenCalled();
    expect(h.releaseMcpOrderIntent).toHaveBeenCalledWith('u1', 'idemphash');
  });

  it('fetch S3 KO (fail-open : blocking false) → la commande CONTINUE (paiement non bloqué)', async () => {
    // Le helper a déjà neutralisé l'infra (fetch-failed → blocking:false). On ne lit que .blocking.
    h.revalidatePrintFiles.mockResolvedValue([
      { url: ARGS.items[0].fileUrl, productId: 2, level: 'error', blocking: false, issues: [{ level: 'error', code: 'fetch-failed', message: 'x' }] },
    ]);
    const r = await placeHeadlessOrder(ARGS, USER, NOW);
    expect(r.ok).toBe(true);
    expect(h.createReservedOrder).toHaveBeenCalled();
  });

  it('image / non-PDF (blocking false) → passe (délégué Sinalite)', async () => {
    h.revalidatePrintFiles.mockResolvedValue([okOutcome(ARGS.items[0].fileUrl)]);
    const r = await placeHeadlessOrder(ARGS, USER, NOW);
    expect(r.ok).toBe(true);
    expect(h.createReservedOrder).toHaveBeenCalled();
  });

  it('warning de dimensions (blocking false) → ne bloque PAS', async () => {
    h.revalidatePrintFiles.mockResolvedValue([
      { url: ARGS.items[0].fileUrl, productId: 2, level: 'warning', blocking: false, issues: [{ level: 'warning', code: 'dimensions-mismatch', message: 'x' }] },
    ]);
    const r = await placeHeadlessOrder(ARGS, USER, NOW);
    expect(r.ok).toBe(true);
    expect(h.createReservedOrder).toHaveBeenCalled();
  });

  it('multi-items, 1 seul mauvais → refus de TOUTE la commande, aucune écriture', async () => {
    h.resolveOrderItem.mockReset();
    h.resolveOrderItem.mockResolvedValueOnce({ ok: true, productId: 2, optionIds: [5, 30], name: 'Carte', slug: 'cartes-de-visite', paper: '14pt', finish: 'aq', quantity: 500, subtotalCents: 2190, uploadUrl: 'x' });
    h.resolveOrderItem.mockResolvedValueOnce({ ok: true, productId: 100, optionIds: [1], name: 'Flyer', slug: 'flyers', paper: 'x', finish: 'y', quantity: 100, subtotalCents: 5000, uploadUrl: 'x' });
    const twoItems = { ...ARGS, items: [ARGS.items[0], { slug: 'flyers', paper: 'x', finish: 'y', quantity: 100, fileUrl: 'https://plio-uploads.s3.ca-central-1.amazonaws.com/uploads/u1/b.pdf' }] };
    h.revalidatePrintFiles.mockResolvedValue([okOutcome(ARGS.items[0].fileUrl), blockOutcome('https://plio-uploads.s3.ca-central-1.amazonaws.com/uploads/u1/b.pdf', 'pdf-encrypted', 100)]);
    const r = await placeHeadlessOrder(twoItems, USER, NOW);
    expect(r.ok).toBe(false);
    expect(h.createReservedOrder).not.toHaveBeenCalled();
    if (!r.ok) expect(r.message).toContain('flyers'); // l'item fautif (index 1) est nommé
  });

  it('H2 — deux items MÊME fileUrl, seul l\'index 1 bloque → nomme le slug par INDEX (pas par URL)', async () => {
    h.resolveOrderItem.mockReset();
    h.resolveOrderItem.mockResolvedValueOnce({ ok: true, productId: 100, optionIds: [1], name: 'Flyer', slug: 'flyers', paper: 'x', finish: 'y', quantity: 100, subtotalCents: 5000, uploadUrl: 'x' });
    h.resolveOrderItem.mockResolvedValueOnce({ ok: true, productId: 2, optionIds: [5, 30], name: 'Carte', slug: 'cartes-de-visite', paper: '14pt', finish: 'aq', quantity: 500, subtotalCents: 2190, uploadUrl: 'x' });
    const sameUrl = ARGS.items[0].fileUrl;
    const twoSameUrl = { ...ARGS, items: [
      { slug: 'flyers', paper: 'x', finish: 'y', quantity: 100, fileUrl: sameUrl },
      { slug: 'cartes-de-visite', paper: '14pt', finish: 'aq', quantity: 500, fileUrl: sameUrl },
    ] };
    // index 0 OK, index 1 bloque — MÊME url pour les deux.
    h.revalidatePrintFiles.mockResolvedValue([okOutcome(sameUrl, 100), blockOutcome(sameUrl, 'pdf-invalid', 2)]);
    const r = await placeHeadlessOrder(twoSameUrl, USER, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('cartes-de-visite'); // index 1 = le vrai fautif
      expect(r.message).not.toContain('flyers');        // attribution par URL aurait nommé l'index 0
    }
  });

  it('Mode B OFF → préflight JAMAIS exécuté (sortie avant la boucle)', async () => {
    h.isHeadlessOrderEnabled.mockReturnValue(false);
    const r = await placeHeadlessOrder(ARGS, USER, NOW);
    expect(r.ok).toBe(false);
    expect(h.revalidatePrintFiles).not.toHaveBeenCalled();
  });
});

describe('placeHeadlessOrder — kill-switch MCP_FILE_PREFLIGHT (audit #6)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('var ABSENTE → enforce par défaut (fail-closed) : fichier corrompu refusé', async () => {
    // Aucun stubEnv → MCP_FILE_PREFLIGHT absent → on valide quand même (oubli de config sûr).
    h.revalidatePrintFiles.mockResolvedValue([blockOutcome(ARGS.items[0].fileUrl)]);
    const r = await placeHeadlessOrder(ARGS, USER, NOW);
    expect(r.ok).toBe(false);
    expect(h.createReservedOrder).not.toHaveBeenCalled();
  });

  it('=off → kill-switch : préflight SAUTÉ (helper non appelé), fichier corrompu passe', async () => {
    vi.stubEnv('MCP_FILE_PREFLIGHT', 'off');
    h.revalidatePrintFiles.mockResolvedValue([blockOutcome(ARGS.items[0].fileUrl)]);
    const r = await placeHeadlessOrder(ARGS, USER, NOW);
    expect(r.ok).toBe(true);
    expect(h.revalidatePrintFiles).not.toHaveBeenCalled();
    expect(h.createReservedOrder).toHaveBeenCalled();
  });

  it('=log → tourne + journalise mais NE bloque PAS (commande créée, claim non relâché)', async () => {
    vi.stubEnv('MCP_FILE_PREFLIGHT', 'log');
    h.revalidatePrintFiles.mockResolvedValue([blockOutcome(ARGS.items[0].fileUrl)]);
    const r = await placeHeadlessOrder(ARGS, USER, NOW);
    expect(r.ok).toBe(true);
    expect(h.revalidatePrintFiles).toHaveBeenCalled();
    expect(h.releaseMcpOrderIntent).not.toHaveBeenCalled();
    expect(h.createReservedOrder).toHaveBeenCalled();
  });

  it('=enforce explicite → fichier corrompu refusé (claim relâché)', async () => {
    vi.stubEnv('MCP_FILE_PREFLIGHT', 'enforce');
    h.revalidatePrintFiles.mockResolvedValue([blockOutcome(ARGS.items[0].fileUrl)]);
    const r = await placeHeadlessOrder(ARGS, USER, NOW);
    expect(r.ok).toBe(false);
    expect(h.releaseMcpOrderIntent).toHaveBeenCalledWith('u1', 'idemphash');
    expect(h.createReservedOrder).not.toHaveBeenCalled();
  });
});
