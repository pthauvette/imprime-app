/**
 * Parse un label de taille Sinalite en dimensions pouces.
 *
 * Les tailles Sinalite sont des labels libres : « 3.5 x 2 », « 6 x 9 »,
 * « 9 x 12 - 3 inch Pocket ». On extrait le PREMIER motif « W x H » (le format
 * du produit ; le reste, ex. « 3 inch Pocket », est une caractéristique).
 *
 * Garde de PLAUSIBILITÉ (0.5–60") : rejette le métrique mal interprété
 * (« 210 x 297 » = A4 en mm) ou le garbage → retourne null → le caller doit
 * RETOMBER sur un warning (jamais bloquer sur une taille non fiable).
 */
export interface ParsedSize {
  widthIn: number;
  heightIn: number;
}

const MIN_IN = 0.5;
const MAX_IN = 60; // couvre grand format (bannières/posters) ; au-delà = pas des pouces

export function parseSizeLabel(label: string | null | undefined): ParsedSize | null {
  if (!label) return null;
  const m = label.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const widthIn = Number(m[1]);
  const heightIn = Number(m[2]);
  if (
    !Number.isFinite(widthIn) || !Number.isFinite(heightIn) ||
    widthIn < MIN_IN || heightIn < MIN_IN ||
    widthIn > MAX_IN || heightIn > MAX_IN
  ) {
    return null; // hors plage plausible → non fiable
  }
  return { widthIn, heightIn };
}

/**
 * Trouve la taille EXACTE sélectionnée : matche les IDs d'options choisies
 * contre le groupe `size` du produit, puis parse le label. null si introuvable
 * ou non parsable (→ le caller retombe sur un warning, pas un blocage).
 *
 * @param sizeGroup  optionGroups['size'] de /api/products/[id] (ou undefined)
 * @param selectedIds  IDs des options sélectionnées (du param `options`)
 */
export function resolveSelectedSize(
  sizeGroup: { id: number; name: string }[] | undefined,
  selectedIds: number[],
): ParsedSize | null {
  if (!sizeGroup?.length) return null;
  const sel = new Set(selectedIds);
  const chosen = sizeGroup.find((o) => sel.has(o.id));
  return parseSizeLabel(chosen?.name);
}
