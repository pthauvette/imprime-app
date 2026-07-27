/**
 * Delta de prix par option du configurateur — finding [15].
 *
 * L'index de variantes (`variantIndex`) est déjà entièrement chargé côté
 * navigateur (lookup O(1), même mécanisme que `lookupPrice` dans
 * ConfigureClient) — calculer le prix qu'AURAIT la combinaison courante si on
 * changeait UNE option ne coûte donc aucun appel réseau supplémentaire.
 *
 * Fail-safe : si la combinaison résultante n'existe pas dans l'index local
 * (matrice de variantes partielle chez Sinalite — cf. le repli distant du
 * prix courant), on retourne `null` plutôt que de deviner un delta. Le
 * caller doit alors n'afficher AUCUN chiffre pour cette option, pas un
 * chiffre faux.
 */

function comboKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join('-');
}

export function lookupComboPrice(ids: number[], variantIndex: Record<string, number>): number | null {
  return variantIndex[comboKey(ids)] ?? null;
}

export interface OptionDeltaContext {
  /** Tous les groupes d'options (hors qty), dans un ordre stable. */
  orderedGroups: string[];
  /** Sélection courante : groupName → optionId. */
  selection: Record<string, number>;
  /** Option de quantité actuellement choisie (le slider). */
  qtyOptionId: number;
  variantIndex: Record<string, number>;
}

/**
 * Delta de prix (en $, même unité que `variantIndex`) si on remplaçait la
 * sélection du groupe `groupName` par `candidateOptionId`, tout le reste
 * égal (autres groupes + qty inchangés). `null` si la combinaison
 * résultante est absente de l'index local, ou si un AUTRE groupe n'a pas
 * encore de sélection connue (état transitoire).
 */
export function computeOptionPriceDelta(
  ctx: OptionDeltaContext,
  groupName: string,
  candidateOptionId: number,
  basePrice: number,
): number | null {
  const candidateIds = ctx.orderedGroups.map((g) =>
    g === groupName ? candidateOptionId : ctx.selection[g],
  );
  if (candidateIds.some((id) => typeof id !== 'number')) return null;
  const price = lookupComboPrice([...(candidateIds as number[]), ctx.qtyOptionId], ctx.variantIndex);
  return price === null ? null : price - basePrice;
}
