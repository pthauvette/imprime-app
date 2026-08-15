/**
 * Ce qu'on SAIT déjà d'une soumission d'issue inconnue.
 *
 * POURQUOI CE FICHIER. Le marqueur `sinaliteSubmitUncertainAt` couvre deux
 * situations que l'encadré admin confondait, et la confusion coûte cher :
 *
 *   A. La réponse de `/order/new` n'est JAMAIS revenue. On ignore tout. Le
 *      seul recours est un humain au portail fournisseur.
 *
 *   B. Le fournisseur a RÉPONDU, avec son numéro de commande — la presse est
 *      lancée, c'est certain — mais l'enregistrement a échoué (transaction
 *      annulée) et le rattachement automatique aussi. Le numéro est donc perdu
 *      de la commande… mais PAS de l'application : il est écrit dans
 *      l'`OrderEvent SINALITE_SUBMIT_UNCERTAIN` que cette branche produit.
 *
 * L'encadré affichait le texte du cas A dans les deux : « la commande existe
 * PEUT-ÊTRE déjà chez l'imprimeur ». Dans le cas B c'est faux — elle existe
 * certainement — et on envoyait l'admin fouiller un portail à la recherche
 * d'un numéro qu'on avait sous la main. Pire, la commande reste PAID dans ce
 * cas (cette branche n'appelle pas `markOrderFailed`), donc l'interface
 * proposait aussi « Annuler », c'est-à-dire rembourser une production réelle.
 */

/** Forme minimale d'un `OrderEvent` pour cette lecture. */
export interface EvenementIncertitude {
  kind: string;
  data: string | null;
  createdAt: Date;
}

/**
 * Numéro de commande fournisseur connu malgré l'absence de `sinaliteOrderId`,
 * ou `null` si l'issue est réellement inconnue.
 *
 * ⚠️ ON PREND LE PLUS RÉCENT QUI PORTE UN NUMÉRO, pas le plus récent tout
 * court : un rejeu ultérieur d'issue inconnue produit un événement SANS
 * numéro, et il ne doit pas effacer ce qu'on avait appris avant. L'ordre du
 * tableau reçu n'est pas supposé — la page admin le trie `desc`, d'autres
 * appelants pourraient ne pas le faire.
 */
export function numeroFournisseurConnu(evenements: EvenementIncertitude[]): number | null {
  let meilleur: { id: number; at: number } | null = null;
  for (const e of evenements) {
    if (e.kind !== 'SINALITE_SUBMIT_UNCERTAIN' || !e.data) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(e.data);
    } catch {
      continue;
    }
    const brut = (parsed as { sinaliteOrderId?: unknown })?.sinaliteOrderId;
    // L'événement de la branche « issue vraiment inconnue » n'en porte pas.
    const id = typeof brut === 'number' ? brut : typeof brut === 'string' ? Number(brut) : NaN;
    if (!Number.isInteger(id) || id <= 0) continue;
    const at = e.createdAt.getTime();
    if (!meilleur || at > meilleur.at) meilleur = { id, at };
  }
  return meilleur?.id ?? null;
}
