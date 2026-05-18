/**
 * Specs bleed / safe margin par famille de produit.
 *
 * Standard de l'industrie : 0.125" (3.175 mm) de bleed tout autour + 0.125"
 * de safe zone à l'intérieur du trim. Pour les grandes pièces (banners,
 * posters > 18"), on monte à 0.25-0.5" parce que les écarts mécaniques de
 * la presse sont proportionnellement plus visibles.
 *
 * Sert au composant /components/upload/PdfMarginOverlay pour afficher des
 * insets VISUELS justes (vs les 5/10 % hardcoded de la v1). Les inches
 * exacts permettent aussi à terme un validator preflight qui catch les
 * fichiers livrés sans bleed correct (ex: 8.5×11 livré à pile 8.5×11
 * au lieu de 8.75×11.25).
 *
 * Mapping :
 *   - Family slug (catalogue.ts CategoryGroup.slug) → spec
 *   - Sinalite raw category string → family slug → spec (via lookup table)
 */

export interface MarginSpec {
  /** Bleed en pouces, tout autour du trim (industry default 0.125"). */
  bleedInches: number;
  /** Safe margin en pouces, à l'intérieur du trim. */
  safeInches: number;
  /** Trim size typique pour cette famille (la plus populaire). */
  typicalTrim: { widthIn: number; heightIn: number };
  /**
   * Inset visuel à utiliser dans l'overlay (% de la plus petite dimension
   * du PDF rendu). Calculé pour rester lisible visuellement même quand
   * le bleed réel est microscopique (ex: flyer 8.5" a bleed de 1.5 %
   * réel mais on l'agrandit à 3 % pour rester visible).
   */
  overlay: {
    bleedPercent: number;
    safePercent: number;
  };
}

/**
 * Registry par family slug (cf. CATEGORY_GROUPS dans lib/catalogue.ts).
 * Tu peux étendre ici sans toucher l'overlay component.
 */
export const MARGIN_SPECS_BY_FAMILY: Record<string, MarginSpec> = {
  'cartes-de-visite': {
    bleedInches: 0.125,
    safeInches: 0.125,
    typicalTrim: { widthIn: 3.5, heightIn: 2 },
    // 3.5×2 → bleed réel 6.25 % de la hauteur, safe 12.5 %. Lisible.
    overlay: { bleedPercent: 6, safePercent: 12 },
  },
  'cartes-postales': {
    bleedInches: 0.125,
    safeInches: 0.125,
    typicalTrim: { widthIn: 4, heightIn: 6 },
    overlay: { bleedPercent: 3, safePercent: 6 },
  },
  'flyers': {
    bleedInches: 0.125,
    safeInches: 0.25,
    typicalTrim: { widthIn: 8.5, heightIn: 11 },
    // Réel 1.5 % bleed sur 8.5 mais on l'agrandit visuellement
    overlay: { bleedPercent: 3, safePercent: 6 },
  },
  'brochures': {
    bleedInches: 0.125,
    safeInches: 0.25,
    typicalTrim: { widthIn: 11, heightIn: 8.5 },
    overlay: { bleedPercent: 3, safePercent: 6 },
  },
  'livrets': {
    bleedInches: 0.125,
    safeInches: 0.25,
    typicalTrim: { widthIn: 8.5, heightIn: 11 },
    overlay: { bleedPercent: 3, safePercent: 6 },
  },
  'banners': {
    bleedInches: 0.5,
    safeInches: 0.5,
    typicalTrim: { widthIn: 36, heightIn: 24 },
    overlay: { bleedPercent: 4, safePercent: 8 },
  },
  'stickers': {
    bleedInches: 0.125,
    safeInches: 0.125,
    typicalTrim: { widthIn: 3, heightIn: 3 },
    overlay: { bleedPercent: 4, safePercent: 8 },
  },
  'enveloppes': {
    bleedInches: 0,
    safeInches: 0.25,
    typicalTrim: { widthIn: 9.5, heightIn: 4.125 },
    // Pas de bleed sur les enveloppes (pas trimées au bord)
    overlay: { bleedPercent: 0, safePercent: 6 },
  },
  'merchandise': {
    bleedInches: 0.125,
    safeInches: 0.5,
    typicalTrim: { widthIn: 4, heightIn: 4 },
    overlay: { bleedPercent: 4, safePercent: 10 },
  },
};

/**
 * Sinalite raw category string → family slug. Sinalite renvoie des noms
 * canoniques type "Business Cards", "Postcards", "Flyers"… on les mappe
 * vers notre taxonomie éditoriale.
 *
 * Si pas de match : retombe sur un default safe (cartes-de-visite,
 * insets visibles).
 */
const SINALITE_TO_FAMILY: Record<string, string> = {
  'business cards': 'cartes-de-visite',
  'specialty business cards': 'cartes-de-visite',
  'folded business cards': 'cartes-de-visite',
  'postcards': 'cartes-postales',
  'flyers': 'flyers',
  'brochures': 'brochures',
  'booklets': 'livrets',
  'banners': 'banners',
  'posters': 'banners',
  'stickers': 'stickers',
  'envelopes': 'enveloppes',
  'apparel': 'merchandise',
  'mugs': 'merchandise',
};

/**
 * Default fallback si on ne sait pas. Lisible visuellement, conservative
 * sur les marges (mieux vaut un user qui ajuste large que de croire qu'il
 * a du marge alors qu'il n'en a pas).
 */
export const DEFAULT_MARGIN_SPEC: MarginSpec = MARGIN_SPECS_BY_FAMILY['cartes-de-visite'];

/** Lookup principale : par slug famille. */
export function getMarginSpecBySlug(familySlug: string | null | undefined): MarginSpec {
  if (!familySlug) return DEFAULT_MARGIN_SPEC;
  return MARGIN_SPECS_BY_FAMILY[familySlug] ?? DEFAULT_MARGIN_SPEC;
}

/** Lookup via Sinalite raw category. Case-insensitive. */
export function getMarginSpecBySinaliteCategory(category: string | null | undefined): MarginSpec {
  if (!category) return DEFAULT_MARGIN_SPEC;
  const slug = SINALITE_TO_FAMILY[category.trim().toLowerCase()];
  return getMarginSpecBySlug(slug);
}

/**
 * Convertit un spec en string human-readable pour les tooltips overlay.
 * Ex: "0.125\" bleed · 0.125\" safe · 3.5 × 2\""
 */
export function describeMarginSpec(spec: MarginSpec): string {
  const { widthIn, heightIn } = spec.typicalTrim;
  return `${spec.bleedInches}″ bleed · ${spec.safeInches}″ safe · ${widthIn} × ${heightIn}″`;
}
