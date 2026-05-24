/**
 * Tests src/lib/seo/compare-pairs.ts — Round 35.
 *
 * Lock-in pure helpers (buildPairs + buildCompareUrls). getTopProductIds
 * non testé ici car nécessite Prisma mock complet — couvert par integration
 * test du sitemap si besoin.
 */

import { describe, it, expect } from 'vitest';
import { buildPairs, buildCompareUrls } from '@/lib/seo/compare-pairs';

describe('buildPairs (Round 35)', () => {
  it('liste vide → []', () => {
    expect(buildPairs([])).toEqual([]);
  });

  it('1 produit → 0 paire', () => {
    expect(buildPairs([7])).toEqual([]);
  });

  it('2 produits → 1 paire (a < b sortie)', () => {
    expect(buildPairs([5, 3])).toEqual([[3, 5]]);
  });

  it('3 produits → 3 paires (C(3,2) = 3)', () => {
    expect(buildPairs([1, 2, 3])).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  it('10 produits → 45 paires (C(10,2) = 45)', () => {
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(buildPairs(ids)).toHaveLength(45);
  });

  it('dédup les inputs (7,7,3 → mêmes paires que 3,7)', () => {
    expect(buildPairs([7, 7, 3])).toEqual([[3, 7]]);
  });

  it('sortie déterministe (a < b pour chaque paire)', () => {
    const pairs = buildPairs([8, 2, 5, 1]);
    for (const [a, b] of pairs) {
      expect(a).toBeLessThan(b);
    }
  });
});

describe('buildCompareUrls', () => {
  it('vide → []', () => {
    expect(buildCompareUrls('https://plio.ca', [])).toEqual([]);
  });

  it('format /compare?ids=A,B', () => {
    expect(buildCompareUrls('https://plio.ca', [[3, 7], [1, 12]])).toEqual([
      'https://plio.ca/compare?ids=3,7',
      'https://plio.ca/compare?ids=1,12',
    ]);
  });

  it('respecte appUrl custom (staging/preview)', () => {
    expect(buildCompareUrls('https://plio-staging.vercel.app', [[1, 2]])).toEqual([
      'https://plio-staging.vercel.app/compare?ids=1,2',
    ]);
  });
});
