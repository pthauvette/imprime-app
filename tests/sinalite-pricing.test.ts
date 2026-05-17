/**
 * Tests pour lookupVariant() — O(1) lookup dans le variant index.
 *
 * Le contrat critique : peu importe l'ordre dans lequel le user a sélectionné
 * ses options, la clé canonicalKey() doit sortir le même string trié → le
 * lookup retourne le bon prix.
 *
 * Si on rate ça, un user qui pick [size: 4, paper: 30] vs [paper: 30, size: 4]
 * voit 2 prix différents → bug d'anti-tampering.
 */

import { describe, it, expect } from 'vitest';
import { lookupVariant } from '@/lib/sinalite/pricing';

describe('lookupVariant — O(1) variant lookup', () => {
  const index = new Map<string, number>([
    ['4-30-107', 12.99],
    ['5-30-107', 14.99],
    ['4-30-200', 9.99],
    ['1-2-3-4-5-6', 99.99],
  ]);

  it('match exact : trouve le prix correct', () => {
    expect(lookupVariant([4, 30, 107], index)).toBe(12.99);
    expect(lookupVariant([5, 30, 107], index)).toBe(14.99);
    expect(lookupVariant([4, 30, 200], index)).toBe(9.99);
  });

  it('CRITIQUE : ordre des optionIds ne change pas le lookup', () => {
    // Si un user soumet ses options dans un autre ordre, on doit
    // retourner le même prix. Sinon attaque type "swap order to get
    // different price" possible.
    expect(lookupVariant([107, 30, 4], index)).toBe(12.99);
    expect(lookupVariant([30, 4, 107], index)).toBe(12.99);
    expect(lookupVariant([107, 4, 30], index)).toBe(12.99);
  });

  it('combo non-existant retourne null (force fallback API)', () => {
    expect(lookupVariant([999, 998], index)).toBeNull();
    expect(lookupVariant([4, 30], index)).toBeNull(); // pas la combo complète
  });

  it('liste vide retourne null sans planter', () => {
    expect(lookupVariant([], index)).toBeNull();
  });

  it('grosse combo (6 options) retourne le bon prix', () => {
    expect(lookupVariant([6, 5, 4, 3, 2, 1], index)).toBe(99.99);
    expect(lookupVariant([1, 2, 3, 4, 5, 6], index)).toBe(99.99);
  });

  it('IDs duplicates ne créent pas de match accidentel', () => {
    // [4, 4, 30] sorted = '4-4-30' qui n'est pas dans l'index
    expect(lookupVariant([4, 4, 30], index)).toBeNull();
  });
});
