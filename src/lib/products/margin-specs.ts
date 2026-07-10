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
  // 2026-06 — 5 produits du catalogue curaté (VIRTUAL_PRODUCTS) qui tombaient au
  // DEFAULT (carte de visite 3.5×2) faute de spec → overlay de marges + bleed du
  // fallback aux mauvaises proportions. typicalTrim = 1ère option `size` réelle du
  // produit Sinalite (id 48/69/15005/58/5528). Bleed std 0.125".
  'cartes-de-voeux': {
    bleedInches: 0.125,
    safeInches: 0.125,
    typicalTrim: { widthIn: 8.5, heightIn: 5.5 },
    overlay: { bleedPercent: 3, safePercent: 6 },
  },
  'accroche-portes': {
    bleedInches: 0.125,
    safeInches: 0.125,
    typicalTrim: { widthIn: 8.5, heightIn: 3.5 },
    overlay: { bleedPercent: 4, safePercent: 8 },
  },
  'invitations': {
    bleedInches: 0.125,
    safeInches: 0.125,
    typicalTrim: { widthIn: 5, heightIn: 7 },
    overlay: { bleedPercent: 3, safePercent: 6 },
  },
  'chemises-presentation': {
    bleedInches: 0.125,
    safeInches: 0.25,
    typicalTrim: { widthIn: 6, heightIn: 9 },
    overlay: { bleedPercent: 3, safePercent: 6 },
  },
  'signets': {
    bleedInches: 0.125,
    safeInches: 0.125,
    typicalTrim: { widthIn: 2, heightIn: 8 },
    overlay: { bleedPercent: 6, safePercent: 12 },
  },
  // 2026-07 — grand format RIGIDE (coroplaste, foam board, sintra, aluminium, yard
  // signs, A-frame, H-stand, POP, canvas). Découpé à la taille : bleed modéré, safe
  // généreux (œillets/bords/pied). typicalTrim = fallback (la vraie taille vient de la
  // sélection). overlay % petit (grand format → un bleed 0.125" est ~0.5 % → on l'agrandit).
  'affiches-rigides': {
    bleedInches: 0.125,
    safeInches: 0.25,
    typicalTrim: { widthIn: 24, heightIn: 18 },
    overlay: { bleedPercent: 4, safePercent: 8 },
  },
  // 2026-07 — papeterie papier (letterhead, bloc-notes, NCR, billets numérotés,
  // calendriers, tent cards). Format lettre par défaut, bleed standard.
  'papeterie': {
    bleedInches: 0.125,
    safeInches: 0.25,
    typicalTrim: { widthIn: 8.5, heightIn: 11 },
    overlay: { bleedPercent: 3, safePercent: 6 },
  },
  // 2026-07 — produits virtuels de fusion (finition-seule) dans les familles
  // list-based. Keyés par slug virtuel (comme cartes-de-voeux/signets/…) : le
  // picker /order/v résout l'aperçu 3D via getMarginSpecBySlug(slug). typicalTrim
  // = 1re taille Sinalite du cluster (la vraie vient de la sélection ensuite).
  'brochure': {
    bleedInches: 0.125,
    safeInches: 0.25,
    typicalTrim: { widthIn: 8.5, heightIn: 11 },
    overlay: { bleedPercent: 3, safePercent: 6 },
  },
  'cartes-detachables': {
    bleedInches: 0.125,
    safeInches: 0.125,
    typicalTrim: { widthIn: 8.5, heightIn: 3.5 },
    overlay: { bleedPercent: 4, safePercent: 8 },
  },
  'affiches': {
    bleedInches: 0.125,
    safeInches: 0.25,
    typicalTrim: { widthIn: 18, heightIn: 24 },
    overlay: { bleedPercent: 2, safePercent: 5 },
  },
  'feuilles-numeriques': {
    bleedInches: 0.125,
    safeInches: 0.25,
    typicalTrim: { widthIn: 12, heightIn: 18 },
    overlay: { bleedPercent: 2, safePercent: 5 },
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
// Exporté pour le test de couverture (margin-specs-coverage.test.ts) : chaque
// catégorie de CATEGORY_GROUPS (catalogue.ts) DOIT être une clé ici, sinon elle
// tombe au défaut carte de visite (bleed 0.125" + overlay 3.5×2 → faux grand format).
// Clés en minuscules (getMarginSpecBySinaliteCategory fait .trim().toLowerCase()).
export const SINALITE_TO_FAMILY: Record<string, string> = {
  // Cartes de visite
  'business cards': 'cartes-de-visite',
  'specialty business cards': 'cartes-de-visite',
  'folded business cards': 'cartes-de-visite',
  // Flyers & dépliants
  'flyers': 'flyers',
  'unaddressed admail': 'flyers',
  // Cartes postales
  'postcards': 'cartes-postales',
  'specialty post cards': 'cartes-postales',
  'postcard addressed': 'cartes-postales',
  'postcard enveloped and addressed': 'cartes-postales',
  // Brochures & livrets (dépliants avec pli / agrafage)
  'brochures': 'brochures',
  'brochure enveloped and addressed': 'brochures',
  'tear cards': 'brochures',
  'booklets': 'livrets',
  // Bannières grand format SOUPLE (vinyle, pull-up rétractable, table covers, affiches)
  'banners': 'banners',
  'vinyl banners': 'banners',
  'pull up banners': 'banners',
  'pull up banners-': 'banners',
  'x-frame banners': 'banners',
  'table covers': 'banners',
  'large format posters': 'banners',
  'posters': 'banners',
  // Grand format RIGIDE (coroplaste, foam, sintra, aluminium, yard signs, A-frame, POP)
  'coroplast signs & yard signs': 'affiches-rigides',
  'coroplast signs & yard signs-': 'affiches-rigides',
  'yard sign': 'affiches-rigides',
  'foam board': 'affiches-rigides',
  'sintra/rigid board': 'affiches-rigides',
  'aluminum signs': 'affiches-rigides',
  'styrene signs': 'affiches-rigides',
  'plastics': 'affiches-rigides',
  'a-frame signs': 'affiches-rigides',
  'a frame stands': 'affiches-rigides',
  'h stands for signs': 'affiches-rigides',
  'display board / pop': 'affiches-rigides',
  'canvas': 'affiches-rigides',
  // Stationnerie
  'envelopes': 'enveloppes',
  'presentation folders': 'chemises-presentation',
  'greeting cards': 'cartes-de-voeux',
  'specialty greeting cards': 'cartes-de-voeux',
  'invitations': 'invitations',
  'door hangers': 'accroche-portes',
  'bookmarks': 'signets',
  'letterhead': 'papeterie',
  'notepads': 'papeterie',
  'ncr forms': 'papeterie',
  'numbered tickets': 'papeterie',
  'wall calendars': 'papeterie',
  'tent cards': 'papeterie',
  'variable printing': 'papeterie',
  'digital sheets': 'papeterie',
  // Étiquettes & stickers (labels, decals, vinyle, aimants)
  'stickers': 'stickers',
  'roll labels / stickers': 'stickers',
  'square cut labels / stickers': 'stickers',
  'clings': 'stickers',
  'floor graphics': 'stickers',
  'window graphics': 'stickers',
  'wall decals': 'stickers',
  'adhesive vinyl': 'stickers',
  'white vinyl': 'stickers',
  'magnets': 'stickers',
  'car magnets': 'stickers',
  'covid-19-decals': 'stickers',
  'covid-19-decals-': 'stickers',
  // Divers / merchandise
  'apparel': 'merchandise',
  'mugs': 'merchandise',
  'sample kits': 'merchandise',
  'supply boxes': 'merchandise',
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
