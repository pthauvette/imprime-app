/**
 * Construction de la clé `variantIndex` pour le wizard de commande.
 *
 * Audit v2 #4.1 — `baseOptionIds` (les options format/papier/finition/délai
 * choisies aux étapes précédentes) peut contenir un ID PARASITE du groupe qty
 * ou turnaround, réinjecté par un aller-retour Upload→Quantité (la page upload
 * propage TOUTES ses options, qty incluse, dans son lien « Précédent »). Si on
 * ne les retire pas avant d'ajouter le qty/turnaround courants, la clé contient
 * deux IDs du même groupe → absente de l'index → prix « — » et funnel bloqué.
 */

/** Retire de baseOptionIds tout ID appartenant au groupe qty ou turnaround. */
export function cleanBaseOptionIds(
  baseOptionIds: number[],
  qtyIds: ReadonlySet<number>,
  turnaroundIds: ReadonlySet<number>,
): number[] {
  return baseOptionIds.filter((id) => !qtyIds.has(id) && !turnaroundIds.has(id));
}

/**
 * Construit la clé d'index (IDs triés, joints par '-') pour un qty + turnaround
 * choisis, à partir d'une base DÉJÀ nettoyée (cf. cleanBaseOptionIds).
 */
export function buildVariantKey(
  cleanedBase: number[],
  qtyId: number,
  turnaroundId?: number,
): string {
  const ids = [...cleanedBase, qtyId];
  if (turnaroundId !== undefined) ids.push(turnaroundId);
  return [...ids].sort((a, b) => a - b).join('-');
}
