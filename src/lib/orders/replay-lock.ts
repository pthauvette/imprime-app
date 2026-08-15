/**
 * Constantes du verrou de rejeu Sinalite — SOURCE UNIQUE.
 *
 * POURQUOI CE FICHIER. La péremption est lue à DEUX endroits qui doivent être
 * d'accord : la route de rejeu, qui prend le verrou, et la route de levée
 * d'incertitude, qui doit refuser tant qu'un rejeu est encore VIVANT. Deux
 * valeurs qui divergeraient rouvriraient exactement le trou que la levée est
 * censée fermer — une levée qui s'autorise pendant qu'un envoi est en vol
 * détruit le verrou de celui-ci, et un second `/order/new` part.
 *
 * ⚠️ TOUTE BAISSE DE CETTE VALEUR EST UNE DÉCISION MONEY. Elle borne le temps
 * pendant lequel une soumission peut être en vol sans qu'on la considère
 * abandonnée. Elle doit rester SUPÉRIEURE à la somme des délais d'attente
 * enfermés dans le verrou : `charges.list` (10 s × 2 tentatives) + le jeton
 * Sinalite (10 s) + `/order/new` (15 s).
 */
export const PEREMPTION_VERROU_MS = 5 * 60_000;

/** Un verrou posé à cette date est-il encore vivant ? */
export function verrouVivant(claimedAt: Date | null | undefined, maintenant = new Date()): boolean {
  if (!claimedAt) return false;
  return maintenant.getTime() - claimedAt.getTime() < PEREMPTION_VERROU_MS;
}
