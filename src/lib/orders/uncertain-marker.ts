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
  // ⚠️ ON IGNORE TOUT CE QUI PRÉCÈDE LA DERNIÈRE LEVÉE. Sans ça, la séquence
  // « épisode A avec numéro → levée par un humain → épisode B réellement
  // inconnu » faisait afficher « Production LANCÉE #481203 » pour un épisode B
  // dont on ne sait rien. L'instruction restait directionnellement juste — le
  // numéro de A correspond à une production réelle — mais la fiche affirmait
  // plus qu'elle ne savait, et c'est exactement le défaut que ce lot corrige
  // ailleurs. Aucune mutation ne pouvait le voir : il faut une séquence avec
  // une levée au milieu.
  const derniereLevee = evenements.reduce(
    (max, e) =>
      e.kind === 'SINALITE_SUBMIT_UNCERTAIN_CLEARED' ? Math.max(max, e.createdAt.getTime()) : max,
    -Infinity,
  );
  let meilleur: { id: number; at: number } | null = null;
  for (const e of evenements) {
    if (e.kind !== 'SINALITE_SUBMIT_UNCERTAIN' || !e.data) continue;
    if (e.createdAt.getTime() < derniereLevee) continue;
    
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

/** Forme minimale pour décider si une commande est « en attente de tranchage ». */
export interface CommandeIncertaine {
  sinaliteSubmitUncertainAt: Date | null;
  sinaliteOrderId: string | null;
}

/**
 * `true` tant qu'un humain n'a pas tranché sur une soumission d'issue inconnue.
 *
 * ⚠️ SOURCE UNIQUE, ET C'EST LE POINT. Quatre routes doivent poser la même
 * question — `cancel`, `resend-confirmation`, `status`, et le bulk — et la
 * revue money-path a trouvé cette famille RÉCIDIVISTE : chaque consommateur
 * qui lit `status` sans connaître le marqueur rouvre un trou d'un genre
 * différent. Quatre copies du même `if` finiraient par diverger.
 *
 * `sinaliteOrderId` non nul lève la condition : dès qu'un numéro est rattaché,
 * la commande est réellement en production et son statut dit vrai.
 */
export function enAttenteDeTranchage(o: CommandeIncertaine): boolean {
  return o.sinaliteSubmitUncertainAt !== null && o.sinaliteOrderId === null;
}

/** Clause Prisma correspondante, pour les requêtes de lot. */
export const OU_TRANCHEE = { OR: [{ sinaliteSubmitUncertainAt: null }, { sinaliteOrderId: { not: null } }] };
