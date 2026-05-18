/**
 * Tests pour lib/products/pricing.ts — wrapper enrichi du variant index.
 *
 *  - Pas d'override DB : retourne les prix bruts Sinalite + hiddenOptionIds vide
 *  - DB unreachable : même comportement (fallback silencieux)
 *  - marginPct > 0 : tous les prix multipliés par (1 + marginPct/100), arrondis cents
 *  - marginPct < 0 : réduction appliquée correctement
 *  - hiddenOptionIds JSON valide : retournés en Set
 *  - hiddenOptionIds corrompu : Set vide (pas de throw)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  it('DB unreachable : pas de throw, fallback aux prix bruts', async () => {
    vi.mocked(prisma.productOverride.findUnique).mockRejectedValueOnce(new Error('DB down'));
    const result = await getEnrichedVariantIndex(137);
    expect(result.marginPct).toBeNull();
    expect(result.index.get('4-30-107')).toBe(47.20);
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
