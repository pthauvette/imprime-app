/**
 * Catalogue UX — regroupe les 61 catégories granulaires Sinalite en
 * 9 familles éditoriales pour le wizard.
 *
 * Chaque famille a:
 *  - slug (URL-friendly), nom affiché, desc, icône SVG name
 *  - sinaliteCategories[] : noms exacts à matcher dans /product[].category
 *
 * Tweakez librement — c'est purement un layer UX au-dessus de la taxonomie API.
 */

import type { SinaliteProduct } from './sinalite/types';

export interface CategoryGroup {
  slug: string;
  name: string;
  description: string;
  icon: 'card' | 'plane' | 'postcard' | 'book' | 'banner' | 'pen' | 'label' | 'tshirt' | 'mug';
  sinaliteCategories: string[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    slug: 'cartes-de-visite',
    name: 'Cartes de visite',
    description: '14pt, 16pt, 18pt — matte, UV, soft touch, foil.',
    icon: 'card',
    sinaliteCategories: ['Business Cards', 'Specialty Business Cards', 'Folded Business Cards'],
  },
  {
    slug: 'flyers',
    name: 'Flyers & dépliants',
    description: '8,5 × 11", 5,5 × 8,5", couché ou mat.',
    icon: 'plane',
    sinaliteCategories: ['Flyers', 'Unaddressed Admail'],
  },
  {
    slug: 'cartes-postales',
    name: 'Cartes postales',
    description: '4 × 6", 5 × 7", 6 × 9". Recto-verso couleur.',
    icon: 'postcard',
    sinaliteCategories: [
      'Postcards',
      'Specialty Post Cards',
      'Postcard Addressed',
      'Postcard Enveloped and Addressed',
    ],
  },
  {
    slug: 'brochures',
    name: 'Brochures & livrets',
    description: 'Pliage, agrafage, reliure parfaite.',
    icon: 'book',
    sinaliteCategories: [
      'Brochures',
      'Booklets',
      'Brochure Enveloped and Addressed',
      'Tear Cards',
    ],
  },
  {
    slug: 'bannieres',
    name: 'Bannières grand format',
    description: 'Vinyle, coroplast, foam, pull-up.',
    icon: 'banner',
    sinaliteCategories: [
      'Vinyl Banners',
      'Pull Up Banners',
      'Pull Up Banners-',
      'X-Frame Banners',
      'A-Frame Signs',
      'A Frame Stands',
      'H Stands for Signs',
      'Coroplast Signs & Yard Signs',
      'Coroplast Signs & Yard Signs-',
      'Aluminum Signs',
      'Foam Board',
      'Sintra/Rigid Board',
      'Styrene Signs',
      'Plastics',
      'Large Format Posters',
      'Posters',
      'Yard Sign',
      'Table Covers',
    ],
  },
  {
    slug: 'stationnerie',
    // "Stationnerie" n'est pas un mot français (calque de l'anglais
    // "stationery") — le terme correct est "Papeterie". Le slug reste
    // inchangé (identifiant interne, pas user-facing) pour ne pas casser
    // les liens/URLs existants (?category=stationnerie).
    name: 'Papeterie',
    description: 'Letterhead, enveloppes, NCR forms, notepads.',
    icon: 'pen',
    sinaliteCategories: [
      'Letterhead',
      'Envelopes',
      'Notepads',
      'NCR Forms',
      'Presentation Folders',
      'Numbered Tickets',
      'Wall Calendars',
      'Greeting Cards',
      'Specialty Greeting Cards',
      'Invitations',
      'Tent Cards',
      'Bookmarks',
      'Door Hangers',
    ],
  },
  {
    slug: 'etiquettes',
    name: 'Étiquettes & stickers',
    description: 'Roll labels, BOPP, vinyle, transparent.',
    icon: 'label',
    sinaliteCategories: [
      'Roll Labels / Stickers',
      'Square Cut Labels / Stickers',
      'Clings',
      'Floor Graphics',
      'Window Graphics',
      'Wall Decals',
      'Adhesive Vinyl',
      'White Vinyl',
      'Magnets',
      'Car Magnets',
      'Covid-19-Decals',
      'Covid-19-Decals-',
    ],
  },
  {
    slug: 'photo-decor',
    name: 'Photo & décor',
    description: 'Canvas, photo panels, posters.',
    icon: 'mug',
    sinaliteCategories: [
      'Canvas',
      'Display Board / POP',
      'Sample Kits',
      'Supply Boxes',
      'Variable Printing',
      'Digital Sheets',
    ],
  },
];

/** Regroupe une liste de produits Sinalite par famille UX. */
export function groupProductsByFamily(
  products: SinaliteProduct[],
): Array<CategoryGroup & { products: SinaliteProduct[]; productCount: number }> {
  return CATEGORY_GROUPS.map((group) => {
    const matched = products.filter((p) =>
      group.sinaliteCategories.includes(p.category),
    );
    return { ...group, products: matched, productCount: matched.length };
  });
}

/** Récupère une famille par son slug, ou null. */
export function findCategoryGroup(slug: string): CategoryGroup | null {
  return CATEGORY_GROUPS.find((g) => g.slug === slug) ?? null;
}

/**
 * Retrouve la famille UX d'une catégorie Sinalite EXACTE (ex. "Business Cards").
 * Remplace `guessCategorySlug` (ConfigureClient.tsx) qui devinait par
 * sous-chaîne et retombait sur « cartes-de-visite » par défaut pour ~44 % du
 * catalogue — cf. docs/experience-client-2026-07.md finding [13].
 */
export function findCategoryGroupBySinaliteCategory(category: string): CategoryGroup | null {
  return CATEGORY_GROUPS.find((g) => g.sinaliteCategories.includes(category)) ?? null;
}
