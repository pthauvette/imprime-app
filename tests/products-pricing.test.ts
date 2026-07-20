/**
 * Tests pour lib/products/pricing.ts — wrapper enrichi du variant index.
 *
 *  - Pas d'override DB : retourne les prix bruts Sinalite + hiddenOptionIds vide
 *  - DB unreachable : THROW (fail-closed — audit P0-2, plus de repli silencieux)
 *  - plancher DEFAULT_MARGIN_PCT quand aucune override (audit P0-1)
 *  - marginPct > 0 : tous les prix multipliés par (1 + marginPct/100), arrondis cents
 *  - marginPct < 0 : réduction appliquée correctement
 *  - hiddenOptionIds JSON valide : retournés en Set
 *  - hiddenOptionIds corrompu : Set vide (pas de throw)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/sinalite/pricing', () => ({
  getVariantIndex: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    productOverride: {
      findUnique: vi.fn(),
    },
  },
}));

import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { getVariantIndex } from '@/lib/sinalite/pricing';
import { prisma } from '@/lib/db';

beforeEach(() => {
  vi.clearAllMocks();
  // Default : index simple à 3 variants
  vi.mocked(getVariantIndex).mockResolvedValue({
    index: new Map([
      ['4-30-107', 47.20],
      ['4-30-108', 52.00],
      ['5-31-107', 100.00],
    ]),
    fromCache: false,
    variantCount: 3,
  });
  vi.mocked(prisma.productOverride.findUnique).mockResolvedValue(null);
});

describe('getEnrichedVariantIndex', () => {
  it('aucun override : retourne le map original (référence partagée pour la cache)', async () => {
    const result = await getEnrichedVariantIndex(137);
    expect(result.marginPct).toBeNull();
    expect(result.hiddenOptionIds.size).toBe(0);
    expect(result.index.get('4-30-107')).toBe(47.20);
    expect(result.variantCount).toBe(3);
  });

  // ⚠️ ATTENTE INVERSÉE (audit pré-lancement 2026-07, P0-2). Ce test
  // verrouillait auparavant « DB unreachable → pas de throw, fallback aux prix
  // bruts » — c'est-à-dire exactement le défaut : une erreur DB était
  // indistinguable d'une absence d'override, donc la commande partait au PRIX
  // COÛTANT (et un produit `disabled` redevenait commandable) le temps du blip.
  // Le recalcul serveur retombant sur la même valeur, aucun PRICE_MISMATCH ne
  // se déclenchait : la perte était invisible. On exige désormais le fail-closed.
  it('DB unreachable : THROW (jamais de repli silencieux sur les prix coûtants)', async () => {
    vi.mocked(prisma.productOverride.findUnique).mockRejectedValueOnce(new Error('DB down'));
    await expect(getEnrichedVariantIndex(137)).rejects.toThrow('DB down');
  });

  it('marginPct +10 : tous les prix ×1.10 arrondis au cent', async () => {
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce({
      sinaliteProductId: 137,
      marginPct: 10,
      hiddenOptionIds: null,
      disabled: false, featured: false, displayName: null, displayDescription: null, notes: null,
      id: 'ov_1', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const result = await getEnrichedVariantIndex(137);
    expect(result.marginPct).toBe(10);
    expect(result.index.get('4-30-107')).toBe(51.92); // 47.20 × 1.10 = 51.92
    expect(result.index.get('4-30-108')).toBe(57.20); // 52.00 × 1.10
    expect(result.index.get('5-31-107')).toBe(110.00);
  });

  it('marginPct -5 : tous les prix ×0.95', async () => {
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce({
      sinaliteProductId: 137, marginPct: -5,
      hiddenOptionIds: null,
      disabled: false, featured: false, displayName: null, displayDescription: null, notes: null,
      id: 'ov_2', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const result = await getEnrichedVariantIndex(137);
    expect(result.marginPct).toBe(-5);
    expect(result.index.get('4-30-107')).toBe(44.84); // 47.20 × 0.95 = 44.84
  });

  it('marginPct = 0 : pas de changement de prix (multiplier = 1)', async () => {
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce({
      sinaliteProductId: 137, marginPct: 0,
      hiddenOptionIds: null,
      disabled: false, featured: false, displayName: null, displayDescription: null, notes: null,
      id: 'ov_3', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const result = await getEnrichedVariantIndex(137);
    expect(result.marginPct).toBe(0);
    // marginPct=0 produit multiplier=1 → 47.20 inchangé
    expect(result.index.get('4-30-107')).toBe(47.20);
  });

  it('hiddenOptionIds JSON array → Set', async () => {
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce({
      sinaliteProductId: 137,
      marginPct: null,
      hiddenOptionIds: '[107,224]',
      disabled: false, featured: false, displayName: null, displayDescription: null, notes: null,
      id: 'ov_4', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const result = await getEnrichedVariantIndex(137);
    expect(result.hiddenOptionIds.has(107)).toBe(true);
    expect(result.hiddenOptionIds.has(224)).toBe(true);
    expect(result.hiddenOptionIds.has(108)).toBe(false);
    expect(result.hiddenOptionIds.size).toBe(2);
  });

  it('hiddenOptionIds JSON corrompu → Set vide (defensive)', async () => {
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce({
      sinaliteProductId: 137,
      marginPct: null,
      hiddenOptionIds: 'pas-du-json',
      disabled: false, featured: false, displayName: null, displayDescription: null, notes: null,
      id: 'ov_5', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const result = await getEnrichedVariantIndex(137);
    expect(result.hiddenOptionIds.size).toBe(0);
  });

  it('hiddenOptionIds : éléments non-numériques filtrés', async () => {
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce({
      sinaliteProductId: 137,
      marginPct: null,
      hiddenOptionIds: '[107, "abc", 224, null]',
      disabled: false, featured: false, displayName: null, displayDescription: null, notes: null,
      id: 'ov_6', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const result = await getEnrichedVariantIndex(137);
    expect(result.hiddenOptionIds.size).toBe(2);
    expect(result.hiddenOptionIds.has(107)).toBe(true);
    expect(result.hiddenOptionIds.has(224)).toBe(true);
  });

  it('arrondi marginPct : 33.33 × 1.10 = 36.66 (pas 36.663)', async () => {
    vi.mocked(getVariantIndex).mockResolvedValueOnce({
      index: new Map([['key1', 33.33]]),
      fromCache: false,
      variantCount: 1,
    });
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce({
      sinaliteProductId: 137, marginPct: 10,
      hiddenOptionIds: null,
      disabled: false, featured: false, displayName: null, displayDescription: null, notes: null,
      id: 'ov_7', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const result = await getEnrichedVariantIndex(137);
    expect(result.index.get('key1')).toBe(36.66);
  });
});

/**
 * Plancher de marge (audit pré-lancement 2026-07, P0-1).
 *
 * Sans override, un produit se vendait au prix COÛTANT Sinalite. Avec les
 * avantages empilés (revendeur −5 %, promo −25 $, port GOLD absorbé), la
 * commande passait SOUS le coût. `DEFAULT_MARGIN_PCT` transforme l'oubli de
 * configuration en marge par défaut plutôt qu'en perte.
 */
describe('plancher DEFAULT_MARGIN_PCT', () => {
  const OLD = process.env.DEFAULT_MARGIN_PCT;
  const OLD_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    vi.mocked(getVariantIndex).mockResolvedValue({
      index: new Map([['4-30-107', 47.20]]),
      variantCount: 1,
    } as never);
  });

  afterEach(() => {
    if (OLD === undefined) delete process.env.DEFAULT_MARGIN_PCT;
    else process.env.DEFAULT_MARGIN_PCT = OLD;
    (process.env as Record<string, string | undefined>).NODE_ENV = OLD_NODE_ENV;
  });

  it('aucune override → le plancher s\'applique', async () => {
    process.env.DEFAULT_MARGIN_PCT = '35';
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce(null);
    const r = await getEnrichedVariantIndex(137);
    expect(r.marginPct).toBe(35);
    expect(r.index.get('4-30-107')).toBe(63.72); // 47.20 × 1.35
  });

  it('override à 0 % = marge nulle VOULUE → le plancher ne s\'applique PAS', async () => {
    // Distinction critique : `?? ` (et non `||`) préserve le 0 explicite de
    // l'admin. Sinon un admin ne pourrait jamais vendre à prix coûtant sciemment.
    process.env.DEFAULT_MARGIN_PCT = '35';
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce({
      sinaliteProductId: 137, marginPct: 0, hiddenOptionIds: null,
      disabled: false, featured: false, displayName: null, displayDescription: null,
      notes: null, id: 'ov', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const r = await getEnrichedVariantIndex(137);
    expect(r.marginPct).toBe(0);
    expect(r.index.get('4-30-107')).toBe(47.20); // prix brut, volontairement
  });

  it('l\'override prime toujours sur le plancher', async () => {
    process.env.DEFAULT_MARGIN_PCT = '35';
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce({
      sinaliteProductId: 137, marginPct: 10, hiddenOptionIds: null,
      disabled: false, featured: false, displayName: null, displayDescription: null,
      notes: null, id: 'ov', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const r = await getEnrichedVariantIndex(137);
    expect(r.marginPct).toBe(10);
  });

  it('PRODUCTION sans marge ni plancher → THROW (refus de coter au coût)', async () => {
    delete process.env.DEFAULT_MARGIN_PCT;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce(null);
    await expect(getEnrichedVariantIndex(137)).rejects.toThrow(/Marge non configurée/);
  });

  it('plancher illisible en production → THROW (pas de repli silencieux)', async () => {
    process.env.DEFAULT_MARGIN_PCT = 'beaucoup';
    (process.env as Record<string, string>).NODE_ENV = 'production';
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce(null);
    await expect(getEnrichedVariantIndex(137)).rejects.toThrow(/Marge non configurée/);
  });

  it('dev sans marge → prix bruts (ne casse pas le développement local)', async () => {
    delete process.env.DEFAULT_MARGIN_PCT;
    (process.env as Record<string, string>).NODE_ENV = 'test';
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce(null);
    const r = await getEnrichedVariantIndex(137);
    expect(r.marginPct).toBeNull();
    expect(r.index.get('4-30-107')).toBe(47.20);
  });
});

/**
 * Corrections issues de la revue money-path adversariale du plancher.
 * Deux failles trouvées et fermées : plancher non borné (prix à zéro) et
 * produit `disabled` renvoyant 500 au lieu de « indisponible ».
 */
describe('plancher — bornes et court-circuit disabled (revue money-path)', () => {
  const OLD = process.env.DEFAULT_MARGIN_PCT;
  const OLD_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    vi.mocked(getVariantIndex).mockResolvedValue({
      index: new Map([['4-30-107', 47.20]]),
      variantCount: 1,
    } as never);
    (process.env as Record<string, string>).NODE_ENV = 'production';
  });

  afterEach(() => {
    if (OLD === undefined) delete process.env.DEFAULT_MARGIN_PCT;
    else process.env.DEFAULT_MARGIN_PCT = OLD;
    (process.env as Record<string, string | undefined>).NODE_ENV = OLD_NODE_ENV;
  });

  // -100 → multiplicateur 0 → TOUS les prix à 0. lookupVariant renverrait 0
  // (pas null) donc PRICE_FETCH_FAILED ne se déclencherait pas, et le
  // expectedSubtotal client vaudrait 0 comme le serveur → aucun PRICE_MISMATCH.
  // La commande partirait au seul prix du port. C'est la vente à perte que le
  // plancher prétend fermer, réintroduite par la porte d'à côté.
  it.each(['-100', '-150', '999', '10.5', 'beaucoup', ''])(
    'DEFAULT_MARGIN_PCT hors bornes ou non entier (%s) → refus de coter',
    async (val) => {
      process.env.DEFAULT_MARGIN_PCT = val;
      vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce(null);
      await expect(getEnrichedVariantIndex(137)).rejects.toThrow(/Marge non configurée/);
    },
  );

  it.each(['-50', '0', '35', '500'])('DEFAULT_MARGIN_PCT dans les bornes (%s) → accepté', async (val) => {
    process.env.DEFAULT_MARGIN_PCT = val;
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce(null);
    const r = await getEnrichedVariantIndex(137);
    expect(r.marginPct).toBe(Number(val));
  });

  // Un produit désactivé n'a pas à être coté : on désactive justement ce qu'on
  // ne veut PAS vendre, donc marginPct est typiquement null. Sans court-circuit,
  // le plancher throw → 500 opaque au lieu du 400 « produit indisponible ».
  it('produit disabled SANS marge → pas de throw, disabled remonte proprement', async () => {
    delete process.env.DEFAULT_MARGIN_PCT; // pire cas : aucun plancher
    vi.mocked(prisma.productOverride.findUnique).mockResolvedValueOnce({
      sinaliteProductId: 137, marginPct: null, hiddenOptionIds: '[42]',
      disabled: true, featured: false, displayName: null, displayDescription: null,
      notes: null, id: 'ov', createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const r = await getEnrichedVariantIndex(137);
    expect(r.disabled).toBe(true);
    expect(r.marginPct).toBeNull();
    expect(r.index.get('4-30-107')).toBe(47.20); // brut : jamais vendu de toute façon
    expect(r.hiddenOptionIds.has(42)).toBe(true); // les autres champs restent exploitables
  });
});
