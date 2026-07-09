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

/** Forme suggérée par le NOM du produit, ou null si aucun indice. PUR. */
export function shapeFromName(name: string | null | undefined): MockupShape | null {
  const n = (name ?? '').toLowerCase();
  if (/(banner|banni|pull ?up|vinyl|vinyle|coroplast|foam|sintra|yard|\bsign|rigid|aluminum|styrene|plastic|table cover|poster|affiche)/.test(n)) return 'banner';
  if (/(flyer|d[ée]plian|admail)/.test(n)) return 'flyer';
  if (/(postcard|carte postale|greeting|v[oœ]ux|invitation)/.test(n)) return 'postcard';
  if (/(sticker|label|[ée]tiquette|decal|magnet|aimant|cling)/.test(n)) return 'sticker';
  if (/(brochure|booklet|livret|folded|folder|pr[ée]sentation|chemise)/.test(n)) return 'folded';
  return null;
}

/** Finition suggérée par le NOM, ou null. `+ AQ` (vernis aqueux) ≈ semi-gloss. PUR. */
export function finishFromName(name: string | null | undefined): MockupFinish | null {
  const n = (name ?? '').toLowerCase();
  if (/(uv|gloss|brillant|\baq\b)/.test(n)) return 'gloss';
  if (/(foil|dorure|m[ée]tallique|metallic)/.test(n)) return 'foil';
  if (/(soft ?touch|velours)/.test(n)) return 'soft';
  if (/(matte|\bmat\b)/.test(n)) return 'matte';
  if (/(kraft|recycl|\beco\b|enviro|uncoated)/.test(n)) return 'kraft';
  return null;
}

/**
 * Devine forme + finition d'un produit depuis son NOM (quand la catégorie n'est pas
 * dispo — ex. items du panier `CartItem`, qui ne portent pas la catégorie). Heuristique
 * par mots-clés, fallback carte de visite plate. PUR → testable.
 */
export function mockupForProductName(name: string | null | undefined): { shape: MockupShape; finish: MockupFinish } {
  return { shape: shapeFromName(name) ?? 'card', finish: finishFromName(name) ?? 'plain' };
}

/**
 * Mockup d'un produit DANS une famille (liste /order/product) — le nom prime,
 * la famille sert de fallback. Sans ça, toutes les rows d'une famille rendaient
 * la forme famille + finition famille → 95 % des 164 produits partageaient leur
 * visuel (mesuré sur docs/sinalite-catalogue-map.draft.json). PUR.
 */
export function mockupForProduct(
  name: string | null | undefined,
  family: { shape: MockupShape; finish: MockupFinish },
): { shape: MockupShape; finish: MockupFinish } {
  return { shape: shapeFromName(name) ?? family.shape, finish: finishFromName(name) ?? family.finish };
}

/**
 * Badge de spec lisible sur le mockup — grammage/épaisseur extrait du nom
 * (« 14PT », « 100LB », « 4MM »). Différencie les variantes d'un même produit
 * (14pt vs 16pt vs 18pt) qui rendraient sinon identiquement. PUR.
 */
export function specForProductName(name: string | null | undefined): string | undefined {
  const m = (name ?? '').match(/(\d{1,3})\s?(pt|lb|mm|oz)\b/i);
  return m ? `${m[1]}${m[2].toUpperCase()}` : undefined;
}

/** Hash déterministe (djb2) du nom — pilote des variations subtiles de layout
 *  (largeur des lignes de texte suggérées) pour que deux produits au même
 *  (forme, finition, badge) restent visuellement distincts. PUR. */
export function mockupSeed(name: string | null | undefined): number {
  const s = name ?? '';
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Normalise le `finishClass` dérivé du nom produit (ProductListClient) en MockupFinish. */
export function toMockupFinish(finishClass: string | null | undefined, fallback: MockupFinish): MockupFinish {
  const f = (finishClass ?? '').trim();
  return (['gloss', 'foil', 'matte', 'soft', 'kraft', 'green', 'plain'] as const).includes(f as MockupFinish)
    ? (f as MockupFinish)
    : fallback;
}
