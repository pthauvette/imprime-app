/**
 * Produits virtuels (cartes de visite, cartes postales) — mapping papier ×
 * finition → productId. Verrouille la résolution + l'intégrité du mapping curé.
 */

import { describe, it, expect } from 'vitest';
import {
  VIRTUAL_PRODUCTS,
  getVirtualProduct,
  virtualPapers,
  virtualFinishes,
  resolveVirtualProductId,
} from '@/lib/products/virtual-products';

describe('produits virtuels — résolution', () => {
  it('cartes de visite : couples connus → bon productId', () => {
    expect(resolveVirtualProductId('cartes-de-visite', '14pt', 'uv')).toBe(7);
    expect(resolveVirtualProductId('cartes-de-visite', '14pt', 'matte')).toBe(8);
    expect(resolveVirtualProductId('cartes-de-visite', '16pt', 'soft-touch')).toBe(7567);
    expect(resolveVirtualProductId('cartes-de-visite', 'kraft', 'standard')).toBe(7332);
  });

  it('cartes postales : couples connus → bon productId', () => {
    expect(resolveVirtualProductId('cartes-postales', '14pt', 'uv')).toBe(20);
    expect(resolveVirtualProductId('cartes-postales', '16pt', 'matte-lam')).toBe(24);
    expect(resolveVirtualProductId('cartes-postales', '10pt', 'aq')).toBe(26);
    expect(resolveVirtualProductId('cartes-postales', 'foil', 'standard')).toBe(7545);
  });

  it('couple ou slug inexistant → null', () => {
    expect(resolveVirtualProductId('cartes-de-visite', '14pt', 'soft-touch')).toBeNull();
    expect(resolveVirtualProductId('cartes-postales', '18pt', 'matte')).toBeNull(); // pas de vrai 18pt postale
    expect(resolveVirtualProductId('inconnu', '14pt', 'uv')).toBeNull();
  });
});

describe('produits virtuels — intégrité du mapping', () => {
  for (const [slug, vp] of Object.entries(VIRTUAL_PRODUCTS)) {
    it(`${slug} : aucun doublon (papier, finition)`, () => {
      const keys = vp.variants.map((v) => `${v.paper}:${v.finish}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it(`${slug} : chaque variant a un productId entier positif`, () => {
      for (const v of vp.variants) {
        expect(Number.isInteger(v.productId)).toBe(true);
        expect(v.productId).toBeGreaterThan(0);
      }
    });

    it(`${slug} : tout papier de variant existe dans papers[] (pas d'orphelin)`, () => {
      const declared = new Set(vp.papers.map((p) => p.key));
      for (const v of vp.variants) expect(declared.has(v.paper)).toBe(true);
    });

    it(`${slug} : virtualPapers() = standards avant specialty, chacun ≥ 1 finition`, () => {
      const papers = virtualPapers(slug);
      expect(papers.length).toBeGreaterThan(0);
      const firstSpecialty = papers.findIndex((p) => p.specialty);
      if (firstSpecialty >= 0) {
        expect(papers.slice(firstSpecialty).every((p) => p.specialty)).toBe(true);
      }
      for (const p of papers) expect(virtualFinishes(slug, p.key).length).toBeGreaterThan(0);
    });
  }

  it('getVirtualProduct retourne undefined pour un slug inconnu', () => {
    expect(getVirtualProduct('nope')).toBeUndefined();
  });
});
