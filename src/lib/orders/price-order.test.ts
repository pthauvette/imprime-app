import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * priceOrder utilise les helpers PURS RÉELS (applyShippingPerks, computeResellerDiscount,
 * computeTax, lookupVariant) → l'arithmétique testée ici est EXACTEMENT celle du
 * checkout web (qui utilise les mêmes). Seuls les I/O sont mockés (Sinalite, prisma,
 * promo). C'est ce qui prouve devis == checkout == MCP.
 */
const { getEnrichedVariantIndex } = vi.hoisted(() => ({ getEnrichedVariantIndex: vi.fn() }));
vi.mock('@/lib/products/pricing', () => ({ getEnrichedVariantIndex }));

const { getProductDetail, getProduct, getPrice } = vi.hoisted(() => ({
  getProductDetail: vi.fn(async () => ({ options: [], pricing: [], metadata: [] })),
  getProduct: vi.fn(async () => ({ id: 2, name: 'Carte de visite', sku: 'x', category: 'c', enabled: 1 })),
  getPrice: vi.fn(),
}));
vi.mock('@/lib/sinalite/client', () => ({
  sinalite: { getProductDetail, getProduct, getPrice },
  SinaliteError: class extends Error {},
}));

const { promoFindUnique } = vi.hoisted(() => ({ promoFindUnique: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { promoCode: { findUnique: promoFindUnique } } }));

const { validatePromo } = vi.hoisted(() => ({ validatePromo: vi.fn() }));
vi.mock('@/lib/promo/validate', () => ({ validatePromo, normalizeCode: (s: string) => s.toUpperCase() }));

vi.mock('@/lib/logger', () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { priceOrder, type PriceOrderInput } from './price-order';

/** index avec UNE variante : key = optionIds triés joints par '-'. */
function idx(price: number, optionIds: number[], over: Record<string, unknown> = {}) {
  const key = [...optionIds].sort((a, b) => a - b).join('-');
  return { index: new Map([[key, price]]), marginPct: null, hiddenOptionIds: new Set<number>(), disabled: false, variantCount: 1, ...over };
}

const baseInput: PriceOrderInput = {
  items: [{ productId: 2, optionIds: [5, 30] }],
  province: 'QC',
  postalCode: 'H2X1Y7',
  shippingMethod: 'UPS Standard',
  shippingPrice: 10,
  enforceShippingSig: false,
  contactEmail: 'x@plio.ca',
  itemCount: 1,
  user: null,
  orderCountForUser: 0,
};

beforeEach(() => {
  getEnrichedVariantIndex.mockReset().mockResolvedValue(idx(21.9, [5, 30]));
  getProductDetail.mockClear();
  getProduct.mockClear();
  getPrice.mockReset();
  promoFindUnique.mockReset();
  validatePromo.mockReset();
});

describe('priceOrder — base (guest, sans promo/perk)', () => {
  it('subtotal + port + taxe ; totalCents = grossTotal (pas de crédit)', async () => {
    const r = await priceOrder(baseInput);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtotal).toBe(21.9);
    expect(r.effectiveShippingPrice).toBe(10); // pas GOLD → port plein
    expect(r.tax.total).toBeGreaterThan(0); // QC taxé
    expect(r.grossTotalCents).toBe(Math.round((21.9 + 10 + r.tax.total) * 100));
    expect(r.walletCreditApplied).toBe(0);
    expect(r.referralCreditApplied).toBe(0);
    expect(r.totalCents).toBe(r.grossTotalCents);
    expect(r.productSummary).toContain('Carte');
  });
});

describe('priceOrder — gardes', () => {
  it('produit désactivé → PRODUCT_DISABLED 400', async () => {
    getEnrichedVariantIndex.mockResolvedValue(idx(21.9, [5, 30], { disabled: true }));
    const r = await priceOrder(baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PRODUCT_DISABLED');
  });
  it('option masquée → OPTION_HIDDEN 400', async () => {
    getEnrichedVariantIndex.mockResolvedValue(idx(21.9, [5, 30], { hiddenOptionIds: new Set([5]) }));
    const r = await priceOrder(baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('OPTION_HIDDEN');
  });
  it('expectedSubtotal divergent → PRICE_MISMATCH 409', async () => {
    const r = await priceOrder({ ...baseInput, expectedSubtotal: 999 });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('PRICE_MISMATCH'); expect(r.status).toBe(409); }
  });
  it('variant absent + Sinalite non numérique → PRICE_FETCH_FAILED 502', async () => {
    getEnrichedVariantIndex.mockResolvedValue(idx(21.9, [999], {})); // key ne matche pas [5,30]
    getPrice.mockResolvedValue({ price: 'N/A', packageInfo: {}, productOptions: {} });
    const r = await priceOrder(baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PRICE_FETCH_FAILED');
  });
});

describe('priceOrder — perks / crédits / promo / reseller', () => {
  it('GOLD → port gratuit', async () => {
    const r = await priceOrder({ ...baseInput, user: { loyaltyTier: 'GOLD', resellerStatus: 'NONE', walletCents: 0, referralCreditCents: 0, taxExempt: false } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.effectiveShippingPrice).toBe(0);
    expect(r.goldFreeShippingApplied).toBe(true);
  });

  it('wallet + referral appliqués (cap grossTotal - 50¢), totalCents réduit', async () => {
    const r = await priceOrder({ ...baseInput, user: { loyaltyTier: 'BRONZE', resellerStatus: 'NONE', walletCents: 3000, referralCreditCents: 1000, taxExempt: false } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.walletCreditApplied).toBeGreaterThan(0);
    expect(r.referralCreditApplied).toBeGreaterThan(0);
    expect(r.totalCents).toBe(r.grossTotalCents - r.walletCreditApplied - r.referralCreditApplied);
    expect(r.totalCents).toBeGreaterThanOrEqual(50); // Stripe min
  });

  it('taxExempt → taxe 0', async () => {
    const r = await priceOrder({ ...baseInput, user: { loyaltyTier: null, resellerStatus: 'NONE', walletCents: 0, referralCreditCents: 0, taxExempt: true } });
    if (r.ok) expect(r.tax.total).toBe(0);
  });

  it('reseller VERIFIED → resellerDiscountAmount > 0', async () => {
    const r = await priceOrder({ ...baseInput, user: { loyaltyTier: null, resellerStatus: 'VERIFIED', walletCents: 0, referralCreditCents: 0, taxExempt: false } });
    if (r.ok) expect(r.resellerDiscountAmount).toBeGreaterThan(0);
  });

  it('promo valide → discountAmount (validatePromo mocké)', async () => {
    promoFindUnique.mockResolvedValue({ id: 'p1', code: 'BIENVENUE10' });
    validatePromo.mockReturnValue({ ok: true, discountCents: 250 });
    const r = await priceOrder({ ...baseInput, promoCode: 'BIENVENUE10' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.discountAmount).toBe(2.5);
    expect(r.promoRecord?.code).toBe('BIENVENUE10');
  });

  it('promo invalide → PROMO_INVALID 400', async () => {
    promoFindUnique.mockResolvedValue({ id: 'p1', code: 'EXPIRED' });
    validatePromo.mockReturnValue({ ok: false, message: 'Code expiré', failureCode: 'EXPIRED' });
    const r = await priceOrder({ ...baseInput, promoCode: 'EXPIRED' });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('PROMO_INVALID'); expect(r.status).toBe(400); }
  });
});

describe('priceOrder — sig de livraison', () => {
  it('sig invalide + enforce=false → log-only, ne bloque pas', async () => {
    const r = await priceOrder({ ...baseInput, shippingQuoteSig: 'bogus', enforceShippingSig: false });
    expect(r.ok).toBe(true); // log-only
  });
  it('sig invalide + enforce=true → SHIPPING_QUOTE_INVALID 409', async () => {
    const r = await priceOrder({ ...baseInput, shippingQuoteSig: 'bogus', enforceShippingSig: true });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('SHIPPING_QUOTE_INVALID'); expect(r.status).toBe(409); }
  });
});
