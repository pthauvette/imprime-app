import { describe, it, expect } from 'vitest';
import { shapeAspect, type MockupShape } from '@/lib/products/product-mockup';

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
