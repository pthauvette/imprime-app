/**
 * « Le fournisseur a-t-il PU créer la commande ? » — source unique.
 *
 * POURQUOI CE FICHIER. Deux chemins soumettent à Sinalite : le webhook Stripe
 * (`lib/webhooks/stripe-process.ts`, ~100 % du volume) et le rejeu admin
 * (`api/admin/orders/[id]/replay-sinalite`). Les deux doivent répondre à la
 * MÊME question quand `createOrder` lève, parce que la réponse décide d'un
 * geste irréversible :
 *   - refus PROUVÉ avant création → on peut rembourser et rouvrir la
 *     soumission ;
 *   - issue INCONNUE → la commande existe peut-être déjà chez l'imprimeur ;
 *     rembourser, c'est payer une production et rendre l'argent ; relancer,
 *     c'est produire deux fois.
 *
 * Deux implémentations de cette règle finiraient par diverger, et la divergence
 * se paierait en productions doubles. Une seule, ici.
 */

import { SinaliteError } from './client';

/**
 * ⚠️ LISTE BLANCHE, ET SURTOUT PAS LA PLAGE 4xx ENTIÈRE.
 *
 * Un jet précédent déduisait « aucune commande n'existe » de
 * `status >= 400 && status < 500`. C'est faux pour au moins deux codes, et ce
 * sont précisément ceux qui coûtent cher :
 *   - 409 signifie LITTÉRALEMENT « existe déjà » — donc une commande a été
 *     créée, peut-être par notre propre envoi précédent ;
 *   - 429 est posable à n'importe quelle couche, y compris APRÈS que la
 *     requête ait été traitée.
 *
 * Ne figurent ici que les codes qui prouvent un refus AVANT création. Dans le
 * doute, on garde l'incertitude : la sanction d'un faux négatif est une
 * impression payée deux fois, celle d'un faux positif quelques minutes
 * d'attente.
 */
export const REFUS_AVANT_CREATION = [400, 401, 403, 404, 413, 422];

/**
 * `true` quand on peut PROUVER que le fournisseur n'a rien créé.
 *
 * Deux formes de preuve, et deux seulement :
 *
 *   1. L'erreur porte un endpoint AUTRE que `/order/new`. `request()` appelle
 *      `getToken()` avant son `fetch`, donc un échec de jeton — le plus banal
 *      de tous, le cache étant par conteneur — survient à coup sûr avant le
 *      moindre paquet vers `/order/new`. Idem pour la validation locale du
 *      payload (`<payload>`) et la configuration (`<config>`).
 *
 *   2. L'erreur vient de `/order/new` AVEC un code de la liste blanche.
 *
 * ⚠️ TOUT LE RESTE EST INCONNU, Y COMPRIS DES SUCCÈS APPARENTS. Un décalage de
 * schéma sur la réponse lève un `SinaliteError` de statut **200** (`res.ok`
 * était vrai) : la commande a été créée et c'est son identifiant qu'on a perdu.
 * Un délai d'attente sur `/order/new` ou sur la lecture du corps lève une
 * exception NUE (`DOMException`, `SyntaxError`) — pas un `SinaliteError` — et
 * signifie la même chose. Ces cas doivent rendre `false`, et c'est le
 * comportement par défaut de cette fonction : on ne conclut à l'absence de
 * création que sur preuve positive.
 */
export function aucuneCreationPossible(err: unknown): boolean {
  if (!(err instanceof SinaliteError)) return false;
  if (err.endpoint !== '/order/new') return true;
  return REFUS_AVANT_CREATION.includes(err.status);
}
