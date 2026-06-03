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
