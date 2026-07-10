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
  virtualSlugForProductId,
  ALL_VIRTUAL_PRODUCT_IDS,
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

  it('autres form-factors : couples connus → bon productId', () => {
    expect(resolveVirtualProductId('flyers', '100lb', 'uv')).toBe(38);
    expect(resolveVirtualProductId('cartes-de-voeux', '14pt', 'matte')).toBe(50);
    expect(resolveVirtualProductId('accroche-portes', '14pt', 'uv')).toBe(70);
    expect(resolveVirtualProductId('invitations', 'foil', 'standard')).toBe(15011);
    expect(resolveVirtualProductId('chemises-presentation', '14pt', 'matte-lam')).toBe(4137);
    expect(resolveVirtualProductId('signets', '16pt', 'gloss-lam')).toBe(5531);
  });

  it('fusion 2026-07 (list-based) : couples connus → bon productId', () => {
    // Brochures 43-46, Tear Cards 129-132, Posters 65-68, Digital Sheets 137-142.
    expect(resolveVirtualProductId('brochure', '100lb', 'uv')).toBe(44);
    expect(resolveVirtualProductId('brochure', 'enviro', 'standard')).toBe(46);
    expect(resolveVirtualProductId('cartes-detachables', '14pt', 'matte')).toBe(130);
    expect(resolveVirtualProductId('affiches', '100lb', 'standard')).toBe(65);
    expect(resolveVirtualProductId('affiches', 'enviro', 'standard')).toBe(68);
    // Digital Sheets : les deux « enviro » de grammages différents résolvent bien.
    expect(resolveVirtualProductId('feuilles-numeriques', 'enviro-13pt', 'standard')).toBe(138);
    expect(resolveVirtualProductId('feuilles-numeriques', 'enviro-80lb', 'standard')).toBe(142);
    expect(resolveVirtualProductId('feuilles-numeriques', '100lb', 'matte')).toBe(141);
  });

  it('couple ou slug inexistant → null', () => {
    expect(resolveVirtualProductId('cartes-de-visite', '14pt', 'soft-touch')).toBeNull();
    expect(resolveVirtualProductId('cartes-postales', '18pt', 'matte')).toBeNull(); // pas de vrai 18pt postale
    expect(resolveVirtualProductId('inconnu', '14pt', 'uv')).toBeNull();
  });

  it('L1 — `allowed` filtre papiers + finitions aux productId actifs', () => {
    // Sans filtre : plusieurs papiers + ≥ 2 finitions sur 14pt.
    expect(virtualPapers('cartes-de-visite').length).toBeGreaterThan(1);
    expect(virtualFinishes('cartes-de-visite', '14pt').length).toBeGreaterThan(1);

    // allowed = seulement 14pt/uv (productId 7) actif → 14pt seul papier, uv seule finition.
    const allowed = new Set([7]);
    expect(virtualPapers('cartes-de-visite', allowed).map((p) => p.key)).toEqual(['14pt']);
    const finishes = virtualFinishes('cartes-de-visite', '14pt', allowed);
    expect(finishes.map((f) => f.finish)).toEqual(['uv']);

    // allowed vide → aucun papier (produit entièrement désactivé).
    expect(virtualPapers('cartes-de-visite', new Set<number>())).toEqual([]);
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

  it('collapse : productId → slug du produit virtuel qui le contient', () => {
    expect(virtualSlugForProductId(7)).toBe('cartes-de-visite');
    expect(virtualSlugForProductId(50)).toBe('cartes-de-voeux');
    expect(virtualSlugForProductId(5531)).toBe('signets');
    expect(virtualSlugForProductId(999999)).toBeUndefined(); // Foil/Die Cut/Letterhead → pas virtuel
  });

  it('collapse : ALL_VIRTUAL_PRODUCT_IDS = union de tous les productId virtuels, sans doublon', () => {
    const total = Object.values(VIRTUAL_PRODUCTS).reduce((n, vp) => n + vp.variants.length, 0);
    // Pas de productId partagé entre 2 produits virtuels → la taille du Set = somme.
    expect(ALL_VIRTUAL_PRODUCT_IDS.size).toBe(total);
  });
});
