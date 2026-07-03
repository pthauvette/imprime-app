/**
 * Aperçu 2D « format » des produits du flow générique (grand format, étiquettes,
 * dépliants…) — ceux qui n'ont PAS l'aperçu 3D des 8 produits curatés.
 *
 * PUR (aucune dépendance React/DOM) : le type de substrat + la géométrie ajustée
 * sont testables sans rendu. Le composant SVG `FormatPreview` les consomme.
 */
import { SINALITE_TO_FAMILY } from './margin-specs';

/** Nature visuelle du produit → décoration du mockup 2D. */
export type FormatKind = 'souple' | 'rigide' | 'label' | 'folded' | 'flat';

/** Famille de marge → nature d'aperçu (réutilise la source unique SINALITE_TO_FAMILY). */
const FAMILY_KIND: Record<string, FormatKind> = {
  banners: 'souple',            // vinyle, pull-up rétractable, X-frame, table covers
  'affiches-rigides': 'rigide', // coroplaste, foam, sintra, aluminium, yard signs, POP
  stickers: 'label',            // étiquettes, decals, aimants
  brochures: 'folded',          // dépliants avec pli
  livrets: 'folded',            // agrafés / reliés
};

export function previewKindForSinaliteCategory(category: string | null | undefined): FormatKind {
  if (!category) return 'flat';
  const family = SINALITE_TO_FAMILY[category.trim().toLowerCase()];
  return family ? FAMILY_KIND[family] ?? 'flat' : 'flat';
}

const KIND_LABEL: Record<FormatKind, string> = {
  souple: 'Grand format souple',
  rigide: 'Grand format rigide',
  label: 'Étiquette / autocollant',
  folded: 'Plié / relié',
  flat: 'Imprimé plat',
};
export function substrateLabel(kind: FormatKind): string {
  return KIND_LABEL[kind];
}

/**
 * Rectangle ajusté au VRAI ratio (widthIn/heightIn) dans une boîte boxW×boxH,
 * centré. Retourne {x,y,w,h} relatifs à l'origine de la boîte. Fallback carré si
 * les dimensions sont invalides. PUR.
 */
export function fitRect(
  widthIn: number,
  heightIn: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number } {
  const aspect =
    Number.isFinite(widthIn) && Number.isFinite(heightIn) && widthIn > 0 && heightIn > 0
      ? widthIn / heightIn
      : 1;
  const boxAspect = boxW / boxH;
  let w: number, h: number;
  if (aspect >= boxAspect) {
    w = boxW;
    h = boxW / aspect;
  } else {
    h = boxH;
    w = boxH * aspect;
  }
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}
