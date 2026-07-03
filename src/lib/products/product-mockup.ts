/**
 * Types + géométrie PURS de la vignette produit (ProductMockup). Séparés du composant
 * SVG pour être testables sans JSX/React.
 */

export type MockupShape = 'card' | 'flyer' | 'postcard' | 'banner' | 'sticker' | 'folded';
export type MockupFinish = 'gloss' | 'foil' | 'matte' | 'soft' | 'kraft' | 'green' | 'plain';

const ASPECT: Record<MockupShape, number> = {
  card: 3.5 / 2,
  flyer: 8.5 / 11,
  postcard: 6 / 4,
  banner: 33 / 80,
  sticker: 1,
  folded: 1,
};

/** Ratio largeur/hauteur de la forme produit. Fallback carte de visite. PUR. */
export function shapeAspect(shape: MockupShape): number {
  return ASPECT[shape] ?? 3.5 / 2;
}
