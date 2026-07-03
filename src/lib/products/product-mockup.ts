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

/**
 * Devine forme + finition d'un produit depuis son NOM (quand la catégorie n'est pas
 * dispo — ex. items du panier `CartItem`, qui ne portent pas la catégorie). Heuristique
 * par mots-clés, fallback carte de visite plate. PUR → testable.
 */
export function mockupForProductName(name: string | null | undefined): { shape: MockupShape; finish: MockupFinish } {
  const n = (name ?? '').toLowerCase();
  let shape: MockupShape = 'card';
  if (/(banner|banni|pull ?up|vinyl|vinyle|coroplast|foam|sintra|yard|\bsign|rigid|aluminum|styrene|plastic|table cover|poster|affiche)/.test(n)) shape = 'banner';
  else if (/(flyer|d[ée]plian|admail)/.test(n)) shape = 'flyer';
  else if (/(postcard|carte postale|greeting|v[oœ]ux|invitation)/.test(n)) shape = 'postcard';
  else if (/(sticker|label|[ée]tiquette|decal|magnet|aimant)/.test(n)) shape = 'sticker';
  else if (/(brochure|booklet|livret|folded|folder|pr[ée]sentation|chemise)/.test(n)) shape = 'folded';

  let finish: MockupFinish = 'plain';
  if (/(uv|gloss|brillant)/.test(n)) finish = 'gloss';
  else if (/(foil|dorure|m[ée]tallique|metallic)/.test(n)) finish = 'foil';
  else if (/(soft ?touch|velours)/.test(n)) finish = 'soft';
  else if (/(matte|\bmat\b)/.test(n)) finish = 'matte';
  else if (/(kraft|recycl|\beco\b)/.test(n)) finish = 'kraft';
  return { shape, finish };
}

/** Normalise le `finishClass` dérivé du nom produit (ProductListClient) en MockupFinish. */
export function toMockupFinish(finishClass: string | null | undefined, fallback: MockupFinish): MockupFinish {
  const f = (finishClass ?? '').trim();
  return (['gloss', 'foil', 'matte', 'soft', 'kraft', 'green', 'plain'] as const).includes(f as MockupFinish)
    ? (f as MockupFinish)
    : fallback;
}
