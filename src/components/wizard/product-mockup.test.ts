import { describe, it, expect } from 'vitest';
import { shapeAspect, mockupForIcon, toMockupFinish, mockupForProductName, MOCKUP_BY_ICON, type MockupShape } from '@/lib/products/product-mockup';

describe('ProductMockup — shapeAspect (vraie forme par produit)', () => {
  it.each([
    ['card', 3.5 / 2],
    ['flyer', 8.5 / 11],
    ['postcard', 6 / 4],
    ['banner', 33 / 80],
    ['sticker', 1],
    ['folded', 1],
  ] as const)('%s → ratio attendu', (shape, aspect) => {
    expect(shapeAspect(shape)).toBeCloseTo(aspect, 5);
  });

  it('formes distinctes : carte paysage, flyer portrait, bannière la plus haute', () => {
    expect(shapeAspect('card')).toBeGreaterThan(1); // paysage
    expect(shapeAspect('flyer')).toBeLessThan(1); // portrait
    expect(shapeAspect('banner')).toBeLessThan(shapeAspect('flyer')); // encore plus haute
  });

  it('forme inconnue → fallback carte de visite (pas de NaN)', () => {
    expect(shapeAspect('bogus' as MockupShape)).toBeCloseTo(3.5 / 2, 5);
  });
});

describe('mockupForIcon — forme/finition par famille (source unique)', () => {
  it('banner→banner, plane→flyer, label→sticker, book→folded', () => {
    expect(mockupForIcon('banner').shape).toBe('banner');
    expect(mockupForIcon('plane').shape).toBe('flyer');
    expect(mockupForIcon('label').shape).toBe('sticker');
    expect(mockupForIcon('book').shape).toBe('folded');
  });
  it('chaque entrée a une forme valide (ratio > 0) et une finition', () => {
    for (const v of Object.values(MOCKUP_BY_ICON)) {
      expect(shapeAspect(v.shape)).toBeGreaterThan(0);
      expect(v.finish).toBeTruthy();
    }
  });
});

describe('toMockupFinish — normalise le finishClass du nom produit', () => {
  it('valeur connue → conservée', () => {
    expect(toMockupFinish('gloss', 'plain')).toBe('gloss');
    expect(toMockupFinish('foil', 'plain')).toBe('foil');
  });
  it('vide / inconnu / null → fallback famille', () => {
    expect(toMockupFinish('', 'matte')).toBe('matte');
    expect(toMockupFinish('weird', 'kraft')).toBe('kraft');
    expect(toMockupFinish(null, 'soft')).toBe('soft');
  });
});

describe('mockupForProductName — devine forme + finition depuis le nom (panier)', () => {
  it.each([
    ['Cartes de visite UV', 'card', 'gloss'],
    ['Foil Business Cards', 'card', 'foil'],
    ['Vinyl Banner', 'banner', 'plain'],
    ['Plastic 14PT', 'banner', 'plain'],
    ['Posters 100LB + UV', 'banner', 'gloss'],
    ['Flyers Matte', 'flyer', 'matte'],
    ['Kraft Postcards', 'postcard', 'kraft'],
    ['Roll Labels / Stickers', 'sticker', 'plain'],
    ['Brochures', 'folded', 'plain'],
  ])('%s → forme/finition attendues', (name, shape, finish) => {
    const m = mockupForProductName(name);
    expect(m.shape).toBe(shape);
    expect(m.finish).toBe(finish);
  });

  it('nom vide / null → carte plate (fallback)', () => {
    expect(mockupForProductName('')).toEqual({ shape: 'card', finish: 'plain' });
    expect(mockupForProductName(null)).toEqual({ shape: 'card', finish: 'plain' });
  });
});
