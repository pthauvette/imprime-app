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

/**
 * Forme + finition représentatives par icône de famille (catalogue.ts). Source unique
 * partagée par la grille catégorie, la liste produit et le récap. Exhaustif (le type
 * garantit chaque icône). PUR.
 */
export const MOCKUP_BY_ICON: Record<
  'card' | 'plane' | 'postcard' | 'book' | 'banner' | 'pen' | 'label' | 'tshirt' | 'mug',
  { shape: MockupShape; finish: MockupFinish }
> = {
  card: { shape: 'card', finish: 'gloss' },
  plane: { shape: 'flyer', finish: 'matte' },
  postcard: { shape: 'postcard', finish: 'gloss' },
  book: { shape: 'folded', finish: 'soft' },
  banner: { shape: 'banner', finish: 'matte' },
  pen: { shape: 'card', finish: 'plain' },
  label: { shape: 'sticker', finish: 'plain' },
  tshirt: { shape: 'card', finish: 'kraft' },
  mug: { shape: 'postcard', finish: 'matte' },
};

export function mockupForIcon(icon: keyof typeof MOCKUP_BY_ICON): { shape: MockupShape; finish: MockupFinish } {
  return MOCKUP_BY_ICON[icon] ?? MOCKUP_BY_ICON.card;
}

/** Normalise le `finishClass` dérivé du nom produit (ProductListClient) en MockupFinish. */
export function toMockupFinish(finishClass: string | null | undefined, fallback: MockupFinish): MockupFinish {
  const f = (finishClass ?? '').trim();
  return (['gloss', 'foil', 'matte', 'soft', 'kraft', 'green', 'plain'] as const).includes(f as MockupFinish)
    ? (f as MockupFinish)
    : fallback;
}
