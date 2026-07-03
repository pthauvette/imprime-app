/**
 * Verrou « chaque produit du catalogue a des marges/overlay corrects ».
 *
 * L'étape d'upload utilise la DIMENSION exacte sélectionnée (resolveSelectedSize),
 * mais le BLEED + les % d'overlay viennent de la famille via getMarginSpecBySinaliteCategory.
 * Une catégorie Sinalite non mappée dans SINALITE_TO_FAMILY tombe au DÉFAUT carte de visite
 * (bleed 0.125" + overlay calibré pour 3,5×2) → FAUX pour un coroplaste 24×36, un pull-up,
 * un dépliant, une étiquette…
 *
 * Ces tests échouent si une catégorie de CATEGORY_GROUPS (catalogue.ts) perd son mapping.
 */
import { describe, it, expect } from 'vitest';
import { CATEGORY_GROUPS } from '@/lib/catalogue';
import {
  SINALITE_TO_FAMILY,
  MARGIN_SPECS_BY_FAMILY,
  DEFAULT_MARGIN_SPEC,
  getMarginSpecBySinaliteCategory,
} from './margin-specs';

describe('margin-specs — couverture des catégories Sinalite', () => {
  it('CHAQUE catégorie de CATEGORY_GROUPS est mappée (aucune ne tombe au défaut carte de visite)', () => {
    const mapped = new Set(Object.keys(SINALITE_TO_FAMILY));
    const unmapped: string[] = [];
    for (const g of CATEGORY_GROUPS) {
      for (const cat of g.sinaliteCategories) {
        if (!mapped.has(cat.trim().toLowerCase())) unmapped.push(`${g.slug} → ${cat}`);
      }
    }
    expect(
      unmapped,
      'catégories sans mapping → bleed/overlay carte de visite (faux pour grand format / étiquettes / dépliants)',
    ).toEqual([]);
  });

  it('chaque famille cible du mapping existe dans MARGIN_SPECS_BY_FAMILY', () => {
    for (const [cat, slug] of Object.entries(SINALITE_TO_FAMILY)) {
      expect(MARGIN_SPECS_BY_FAMILY[slug], `"${cat}" → "${slug}" absent de MARGIN_SPECS_BY_FAMILY`).toBeDefined();
    }
  });

  it('grand format / étiquettes ne reçoivent PLUS la spec carte de visite', () => {
    for (const cat of [
      'Coroplast Signs & Yard Signs',
      'Pull Up Banners',
      'Foam Board',
      'Vinyl Banners',
      'Roll Labels / Stickers',
      'Brochures',
    ]) {
      expect(getMarginSpecBySinaliteCategory(cat), `${cat} tombe encore au défaut carte de visite`).not.toBe(DEFAULT_MARGIN_SPEC);
    }
  });

  it('coroplaste = grand format rigide (trim large, pas 3,5×2)', () => {
    const coro = getMarginSpecBySinaliteCategory('Coroplast Signs & Yard Signs');
    expect(coro.typicalTrim.widthIn).toBeGreaterThan(10);
    expect(coro.typicalTrim.heightIn).toBeGreaterThan(10);
  });

  it('case-insensitive + trim (Sinalite peut varier la casse/espaces)', () => {
    expect(getMarginSpecBySinaliteCategory('  VINYL BANNERS  ')).toBe(MARGIN_SPECS_BY_FAMILY['banners']);
  });
});
