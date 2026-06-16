/**
 * Tests pour le registry product margin specs + lookups.
 */

import { describe, it, expect } from 'vitest';
import {
  MARGIN_SPECS_BY_FAMILY,
  DEFAULT_MARGIN_SPEC,
  getMarginSpecBySlug,
  getMarginSpecBySinaliteCategory,
  describeMarginSpec,
} from '@/lib/products/margin-specs';

describe('MARGIN_SPECS_BY_FAMILY', () => {
  it('couvre les familles du catalogue (dont les 8 produits curatés)', () => {
    const keys = Object.keys(MARGIN_SPECS_BY_FAMILY).sort();
    expect(keys).toEqual([
      'accroche-portes',
      'banners',
      'brochures',
      'cartes-de-visite',
      'cartes-de-voeux',
      'cartes-postales',
      'chemises-presentation',
      'enveloppes',
      'flyers',
      'invitations',
      'livrets',
      'merchandise',
      'signets',
      'stickers',
    ]);
  });

  it.each(Object.entries(MARGIN_SPECS_BY_FAMILY))(
    '%s a des valeurs sensées',
    (_slug, spec) => {
      expect(spec.bleedInches).toBeGreaterThanOrEqual(0);
      expect(spec.bleedInches).toBeLessThanOrEqual(1);
      expect(spec.safeInches).toBeGreaterThan(0);
      expect(spec.safeInches).toBeLessThanOrEqual(1);
      expect(spec.typicalTrim.widthIn).toBeGreaterThan(0);
      expect(spec.typicalTrim.heightIn).toBeGreaterThan(0);
      expect(spec.overlay.bleedPercent).toBeGreaterThanOrEqual(0);
      expect(spec.overlay.bleedPercent).toBeLessThan(spec.overlay.safePercent + 1);
      expect(spec.overlay.safePercent).toBeGreaterThan(0);
      expect(spec.overlay.safePercent).toBeLessThan(30);
    },
  );

  it('cartes-de-visite : 0.125 bleed + safe (standard industrie)', () => {
    const cv = MARGIN_SPECS_BY_FAMILY['cartes-de-visite'];
    expect(cv.bleedInches).toBe(0.125);
    expect(cv.safeInches).toBe(0.125);
    expect(cv.typicalTrim).toEqual({ widthIn: 3.5, heightIn: 2 });
  });

  it('enveloppes : pas de bleed (cas particulier)', () => {
    expect(MARGIN_SPECS_BY_FAMILY['enveloppes'].bleedInches).toBe(0);
    expect(MARGIN_SPECS_BY_FAMILY['enveloppes'].overlay.bleedPercent).toBe(0);
  });

  it('banners : bleed plus généreux (grandes pièces)', () => {
    const b = MARGIN_SPECS_BY_FAMILY['banners'];
    expect(b.bleedInches).toBeGreaterThan(MARGIN_SPECS_BY_FAMILY['cartes-de-visite'].bleedInches);
  });
});

describe('getMarginSpecBySlug', () => {
  it('retourne le spec pour une slug connue', () => {
    expect(getMarginSpecBySlug('flyers')).toBe(MARGIN_SPECS_BY_FAMILY['flyers']);
  });

  it('null/undefined → default', () => {
    expect(getMarginSpecBySlug(null)).toBe(DEFAULT_MARGIN_SPEC);
    expect(getMarginSpecBySlug(undefined)).toBe(DEFAULT_MARGIN_SPEC);
  });

  it('slug inconnue → default', () => {
    expect(getMarginSpecBySlug('totally-fake')).toBe(DEFAULT_MARGIN_SPEC);
  });
});

describe('getMarginSpecBySinaliteCategory', () => {
  it('Business Cards → cartes-de-visite', () => {
    expect(getMarginSpecBySinaliteCategory('Business Cards')).toBe(
      MARGIN_SPECS_BY_FAMILY['cartes-de-visite'],
    );
  });

  it('case-insensitive + trim', () => {
    expect(getMarginSpecBySinaliteCategory('  BUSINESS CARDS  ')).toBe(
      MARGIN_SPECS_BY_FAMILY['cartes-de-visite'],
    );
  });

  it('Postcards → cartes-postales', () => {
    expect(getMarginSpecBySinaliteCategory('Postcards')).toBe(
      MARGIN_SPECS_BY_FAMILY['cartes-postales'],
    );
  });

  it('Envelopes → enveloppes (pas de bleed)', () => {
    expect(getMarginSpecBySinaliteCategory('Envelopes').bleedInches).toBe(0);
  });

  it('category inconnue → default', () => {
    expect(getMarginSpecBySinaliteCategory('Quantum Decoders')).toBe(DEFAULT_MARGIN_SPEC);
  });

  // Anti-régression : les 5 produits curatés qui tombaient au DEFAULT ont
  // maintenant leur propre spec (≠ carte de visite).
  it.each([
    ['Greeting Cards', 'cartes-de-voeux'],
    ['Door Hangers', 'accroche-portes'],
    ['Invitations', 'invitations'],
    ['Presentation Folders', 'chemises-presentation'],
    ['Bookmarks', 'signets'],
  ])('%s → spec dédiée (≠ default carte de visite)', (category, slug) => {
    const spec = getMarginSpecBySinaliteCategory(category);
    expect(spec).toBe(MARGIN_SPECS_BY_FAMILY[slug]);
    expect(spec).not.toBe(DEFAULT_MARGIN_SPEC);
  });

  it('null → default', () => {
    expect(getMarginSpecBySinaliteCategory(null)).toBe(DEFAULT_MARGIN_SPEC);
  });
});

describe('describeMarginSpec', () => {
  it('formate une string lisible avec unités', () => {
    const s = describeMarginSpec(MARGIN_SPECS_BY_FAMILY['cartes-de-visite']);
    expect(s).toContain('0.125');
    expect(s).toContain('bleed');
    expect(s).toContain('safe');
    expect(s).toContain('3.5');
    expect(s).toContain('2');
  });
});
