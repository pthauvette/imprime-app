/**
 * Produit virtuel « Carte de visite » — mapping papier × finition → productId.
 *
 * Verrouille la résolution (l'axe finition sélectionne le bon productId Sinalite)
 * et la cohérence du mapping curé (pas de doublon papier+finition).
 */

import { describe, it, expect } from 'vitest';
import {
  CARD_VARIANTS,
  cardPapers,
  cardFinishes,
  resolveCardProductId,
} from '@/lib/products/virtual-products';

describe('virtual cards mapping', () => {
  it('résout les couples connus vers le bon productId', () => {
    expect(resolveCardProductId('14pt', 'uv')).toBe(7);
    expect(resolveCardProductId('14pt', 'matte')).toBe(8);
    expect(resolveCardProductId('16pt', 'soft-touch')).toBe(7567);
    expect(resolveCardProductId('kraft', 'standard')).toBe(7332);
  });

  it('retourne null pour un couple inexistant', () => {
    expect(resolveCardProductId('14pt', 'soft-touch')).toBeNull();
    expect(resolveCardProductId('inconnu', 'uv')).toBeNull();
  });

  it('aucun doublon (papier, finition) dans le mapping', () => {
    const keys = CARD_VARIANTS.map((v) => `${v.paper}:${v.finish}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('chaque variant a un productId entier positif', () => {
    for (const v of CARD_VARIANTS) {
      expect(Number.isInteger(v.productId)).toBe(true);
      expect(v.productId).toBeGreaterThan(0);
    }
  });

  it('cardPapers() ne renvoie que des papiers réellement présents, standards avant specialty', () => {
    const papers = cardPapers();
    expect(papers.length).toBeGreaterThan(0);
    const firstSpecialtyIdx = papers.findIndex((p) => p.specialty);
    if (firstSpecialtyIdx >= 0) {
      // aucun standard après le premier specialty
      expect(papers.slice(firstSpecialtyIdx).every((p) => p.specialty)).toBe(true);
    }
    // chaque papier listé a au moins une finition
    for (const p of papers) expect(cardFinishes(p.key).length).toBeGreaterThan(0);
  });
});
