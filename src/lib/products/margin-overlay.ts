/**
 * Géométrie pure pour l'overlay bleed/trim/safe (PdfMarginOverlay).
 *
 * Extrait pour être testable indépendamment du rendu SVG/React — la question
 * « quelle taille de page utiliser » est le cœur du finding [21] : le VRAI
 * fichier mesuré (`realDimsIn`) prime sur la taille typique de la famille
 * (`marginSpec.typicalTrim`), qui reste un repli si le fichier n'a pas pu
 * être mesuré (non-PDF, parse échoué).
 */

import type { MarginSpec } from './margin-specs';

/** % minimum d'un inset pour rester VISIBLE même sur grand format. */
const MIN_VISIBLE_PCT = 2.2;

export interface OverlayGeometry {
  pageW: number;
  pageH: number;
  hasBleed: boolean;
  trimX: number;
  trimY: number;
  safeX: number;
  safeY: number;
}

/**
 * Taille de page (pouces) à utiliser comme référence pour les insets.
 * Priorité : dimensions réelles mesurées > trim typique de la famille + bleed.
 */
export function resolveOverlayPageSize(
  marginSpec: Pick<MarginSpec, 'typicalTrim' | 'bleedInches'>,
  realDimsIn?: { width: number; height: number },
): { pageW: number; pageH: number } {
  if (realDimsIn && realDimsIn.width > 0 && realDimsIn.height > 0) {
    return { pageW: realDimsIn.width, pageH: realDimsIn.height };
  }
  return {
    pageW: marginSpec.typicalTrim.widthIn + marginSpec.bleedInches * 2,
    pageH: marginSpec.typicalTrim.heightIn + marginSpec.bleedInches * 2,
  };
}

/** Calcule la géométrie complète (taille de page + insets %) pour l'overlay. */
export function computeOverlayGeometry(
  marginSpec: MarginSpec,
  realDimsIn?: { width: number; height: number },
): OverlayGeometry {
  const { pageW, pageH } = resolveOverlayPageSize(marginSpec, realDimsIn);
  const bleedIn = marginSpec.bleedInches;
  const safeIn = marginSpec.safeInches;

  const pct = (insetIn: number, page: number, floor = true) => {
    const raw = (insetIn / page) * 100;
    return floor && raw > 0 ? Math.max(raw, MIN_VISIBLE_PCT) : raw;
  };

  return {
    pageW,
    pageH,
    hasBleed: bleedIn > 0,
    trimX: pct(bleedIn, pageW),
    trimY: pct(bleedIn, pageH),
    safeX: pct(bleedIn + safeIn, pageW),
    safeY: pct(bleedIn + safeIn, pageH),
  };
}
