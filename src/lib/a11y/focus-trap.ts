/**
 * Cœur testable d'un focus-trap (Audit v2 #9.1).
 *
 * Quand on Tab/Shift+Tab dans un modal, le focus ne doit jamais sortir : il
 * cycle entre le premier et le dernier élément focusable. Cette fonction décide
 * l'index vers lequel renvoyer le focus (ou null = comportement natif, pas de
 * wrap). Le hook DOM (useConfirmDialog) gère la collecte des éléments + le
 * preventDefault.
 *
 * @param currentIndex index de l'élément actuellement focusé dans la liste
 *                     (−1 si le focus est hors de la liste).
 * @param count        nombre d'éléments focusables.
 * @param shiftKey     true si Shift+Tab (sens arrière).
 * @returns index cible à focuser, ou null si aucun wrap n'est requis.
 */
export function wrapFocusIndex(
  currentIndex: number,
  count: number,
  shiftKey: boolean,
): number | null {
  if (count <= 0) return null;
  // Focus hors de la liste (ou sur le conteneur) → on le ramène à l'extrémité
  // d'entrée : premier en avant, dernier en arrière.
  if (currentIndex < 0) return shiftKey ? count - 1 : 0;
  if (shiftKey && currentIndex === 0) return count - 1; // wrap au dernier
  if (!shiftKey && currentIndex === count - 1) return 0; // wrap au premier
  return null; // au milieu → laisser le navigateur gérer
}
