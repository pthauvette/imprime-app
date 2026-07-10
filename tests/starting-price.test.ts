/**
 * Prix vitrine dynamique — Audit v2 #8.7.
 *
 * Verrouille la logique PURE derrière le badge home « dès X $/carte à N u » :
 * (1) quantityByOptionId n'indexe que le groupe `qty`, parse le name, ignore les
 * options cachées + les noms non numériques ; (2) bestUnitPrice balaie l'index
 * (prix en DOLLARS) et retourne le meilleur $/unité (cents) + sa quantité, en
 * ignorant les variants sans qty et les prix ≤ 0.
 */

import { describe, it, expect } from 'vitest';
import {
  quantityByOptionId,
  bestUnitPrice,
  minTotalCents,
  refreshOrder,
} from '@/lib/products/starting-price';
import type { SinaliteOption } from '@/lib/sinalite/types';

const opts: SinaliteOption[] = [
  { id: 5, group: 'Size', name: '3.5x2' },
  { id: 100, group: 'qty', name: '100' },
  { id: 101, group: 'qty', name: '1000' },
  { id: 102, group: 'qty', name: 'Custom' }, // non numérique → ignoré
];

describe('quantityByOptionId (#8.7)', () => {
  it('indexe uniquement le groupe qty, parse le name, ignore non-numérique', () => {
    const m = quantityByOptionId(opts);
    expect(m.get(100)).toBe(100);
    expect(m.get(101)).toBe(1000);
    expect(m.has(5)).toBe(false); // groupe Size
    expect(m.has(102)).toBe(false); // name 'Custom'
    expect(m.size).toBe(2);
  });

  it('ignore les qty cachées par l\'admin', () => {
    const m = quantityByOptionId(opts, new Set([101]));
    expect(m.has(101)).toBe(false);
    expect(m.get(100)).toBe(100);
    expect(m.size).toBe(1);
  });
});

describe('bestUnitPrice (#8.7)', () => {
  const qtyById = new Map<number, number>([[100, 100], [101, 1000]]);

  it('retourne le meilleur $/unité (cents) + sa quantité', () => {
    // 52 $ / 100 = 0,52 $/u ; 80 $ / 1000 = 0,08 $/u (plancher) ; 120 $ / 1000 = 0,12 $/u
    const index = new Map<string, number>([
      ['5-100', 52],
      ['5-101', 80],
      ['6-101', 120],
    ]);
    const best = bestUnitPrice(index, qtyById);
    expect(best).toEqual({ unitPriceCents: 8, atQuantity: 1000 });
  });

  it('ignore les variants sans option qty dans la clé et les prix ≤ 0', () => {
    const index = new Map<string, number>([
      ['5', 999],        // pas de qty → ignoré
      ['5-100', 0],      // prix 0 → ignoré
      ['5-101', 40],     // 40 $ / 1000 = 0,04 $/u
    ]);
    const best = bestUnitPrice(index, qtyById);
    expect(best).toEqual({ unitPriceCents: 4, atQuantity: 1000 });
  });

  it('null si aucune qty connue ou index vide', () => {
    expect(bestUnitPrice(new Map([['5-101', 80]]), new Map())).toBeNull();
    expect(bestUnitPrice(new Map(), qtyById)).toBeNull();
  });
});

describe('minTotalCents (prix « à partir de » des listes)', () => {
  it('retourne le plus petit TOTAL en cents (≠ bestUnitPrice qui divise par la qty)', () => {
    // 52 $ est le plus petit panier même si 80 $/1000 a un meilleur $/unité.
    const index = new Map<string, number>([
      ['5-100', 52],
      ['5-101', 80],
      ['6-101', 120.49],
    ]);
    expect(minTotalCents(index)).toBe(5200);
  });

  it('arrondit au cent (les prix Sinalite × markup peuvent produire 24.994999…)', () => {
    expect(minTotalCents(new Map([['1', 24.994999]]))).toBe(2499);
    expect(minTotalCents(new Map([['1', 24.995001]]))).toBe(2500);
  });

  it('ignore les prix ≤ 0 / NaN ; null si rien d\'exploitable', () => {
    expect(minTotalCents(new Map([['1', 0], ['2', -3], ['3', NaN]]))).toBeNull();
    expect(minTotalCents(new Map())).toBeNull();
    expect(minTotalCents(new Map([['1', 0], ['2', 18]]))).toBe(1800);
  });
});

describe('refreshOrder (file du cron refresh-product-prices)', () => {
  it('jamais-calculés d\'abord, puis du plus vieux au plus récent, tiebreak par id', () => {
    const computedAt = new Map<number, Date>([
      [10, new Date('2026-07-01T00:00:00Z')],
      [20, new Date('2026-07-05T00:00:00Z')],
      [30, new Date('2026-07-01T00:00:00Z')], // même date que 10 → id croissant
    ]);
    expect(refreshOrder([20, 30, 40, 10, 5], computedAt)).toEqual([5, 40, 10, 30, 20]);
  });

  it('ne mute pas l\'entrée et tolère une map vide (tout est « jamais calculé »)', () => {
    const ids = [3, 1, 2];
    expect(refreshOrder(ids, new Map())).toEqual([1, 2, 3]);
    expect(ids).toEqual([3, 1, 2]);
  });
});
