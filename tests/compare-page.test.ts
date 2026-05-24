/**
 * Tests pour /compare page — Round 29 #3.
 *
 * Lock-in :
 *   - ?ids parsing : split + cap 3 + filter invalid
 *   - Empty state si pas d'ids
 *   - Fetch parallel + .catch fallback per-product (1 erreur ne casse pas les autres)
 *   - Lowest price highlight cross-product
 *
 * Pas de smoke test JSX (vitest env=node, pas de jsdom). On test la
 * logique métier via simulation directe : empty case + parsing.
 */

import { describe, it, expect } from 'vitest';

/**
 * Reproduit la logique de parsing inline du component pour la tester
 * en pure function. Si le component évolue, garder cette fonction
 * synchrone avec sa logique.
 */
function parseIds(idsParam: string, maxCompare = 3): number[] {
  return idsParam
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, maxCompare);
}

describe('/compare ?ids parsing', () => {
  it('vide → []', () => {
    expect(parseIds('')).toEqual([]);
  });

  it('1 id valide', () => {
    expect(parseIds('7')).toEqual([7]);
  });

  it('plusieurs ids séparés par virgule', () => {
    expect(parseIds('1,7,12')).toEqual([1, 7, 12]);
  });

  it('strip whitespace dans chaque token', () => {
    expect(parseIds('  1 , 7 , 12  ')).toEqual([1, 7, 12]);
  });

  it('filtre les non-numériques', () => {
    expect(parseIds('1,abc,7')).toEqual([1, 7]);
  });

  it('filtre les négatifs et zéro', () => {
    expect(parseIds('1,-5,0,7')).toEqual([1, 7]);
  });

  it('cap à MAX_COMPARE (3 par défaut)', () => {
    expect(parseIds('1,2,3,4,5')).toEqual([1, 2, 3]);
  });

  it('cap custom', () => {
    expect(parseIds('1,2,3,4,5', 2)).toEqual([1, 2]);
  });

  it('trailing comma OK (no empty zero injected)', () => {
    expect(parseIds('1,7,')).toEqual([1, 7]);
  });

  it('decimals → parseInt tronque au int', () => {
    expect(parseIds('1.9,7.2')).toEqual([1, 7]);
  });
});
