/**
 * Tests pour computeOverlayGeometry / resolveOverlayPageSize — finding [21].
 *
 * Verrouille : l'overlay bleed/trim/safe se dessine sur la VRAIE taille
 * mesurée du fichier quand elle est disponible, jamais sur la taille
 * typique de la famille (sauf en repli, si le fichier n'a pas pu être
 * mesuré).
 */

import { describe, it, expect } from 'vitest';
import { computeOverlayGeometry, resolveOverlayPageSize } from '@/lib/products/margin-overlay';
import { MARGIN_SPECS_BY_FAMILY } from '@/lib/products/margin-specs';

const CARTE = MARGIN_SPECS_BY_FAMILY['cartes-de-visite']; // typicalTrim 3.5×2, bleed 0.125

describe('resolveOverlayPageSize', () => {
  it('sans realDimsIn → repli sur typicalTrim + bleed×2', () => {
    const { pageW, pageH } = resolveOverlayPageSize(CARTE);
    expect(pageW).toBeCloseTo(3.5 + 0.25);
    expect(pageH).toBeCloseTo(2 + 0.25);
  });

  it('avec realDimsIn → utilise la VRAIE taille, ignore typicalTrim', () => {
    const { pageW, pageH } = resolveOverlayPageSize(CARTE, { width: 5, height: 7 });
    expect(pageW).toBe(5);
    expect(pageH).toBe(7);
  });

  it('realDimsIn à 0 (mesure ratée) → repli, ne divise jamais par zéro', () => {
    const { pageW, pageH } = resolveOverlayPageSize(CARTE, { width: 0, height: 0 });
    expect(pageW).toBeCloseTo(3.75);
    expect(pageH).toBeCloseTo(2.25);
  });
});

describe('computeOverlayGeometry — finding [21]', () => {
  it('fichier PILE au trim (sans bleed réel) → l\'inset trim reflète la VRAIE taille, pas la typique', () => {
    // Carte de visite livrée à 3.5×2 pile (aucun bleed ajouté par le designer).
    const g = computeOverlayGeometry(CARTE, { width: 3.5, height: 2 });
    // Avant le fix : trimX aurait été calculé contre pageW=3.75 (typicalTrim+bleed),
    // donnant un inset ≈3.3%. Avec le vrai fichier (pageW=3.5), l'inset est plus
    // grand (≈3.57%) — reflète honnêtement qu'il n'y a PAS de marge de bleed réelle.
    expect(g.pageW).toBe(3.5);
    const expectedTrimX = (0.125 / 3.5) * 100;
    expect(g.trimX).toBeCloseTo(expectedTrimX, 5);
  });

  it('sans mesure réelle (image, parse échoué) → comportement identique à avant (typicalTrim)', () => {
    const g = computeOverlayGeometry(CARTE, undefined);
    expect(g.pageW).toBeCloseTo(3.75);
    expect(g.pageH).toBeCloseTo(2.25);
  });

  it('enveloppes (bleed=0) → hasBleed false peu importe realDimsIn', () => {
    const env = MARGIN_SPECS_BY_FAMILY['enveloppes'];
    const g = computeOverlayGeometry(env, { width: 9.5, height: 4.125 });
    expect(g.hasBleed).toBe(false);
  });

  it('plancher de visibilité : un inset minuscule sur grand format reste ≥ MIN_VISIBLE_PCT', () => {
    const banners = MARGIN_SPECS_BY_FAMILY['banners'];
    const g = computeOverlayGeometry(banners, { width: 96, height: 48 }); // grand format réel
    expect(g.trimX).toBeGreaterThanOrEqual(2.2);
  });
});
