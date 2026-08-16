/**
 * Quels `OrderEvent` un CLIENT peut voir — source unique.
 *
 * POURQUOI CE FICHIER. La liste vivait en dur dans `OrderEventsTimeline.tsx`,
 * et la seconde surface client — le PDF d'historique téléchargeable
 * (`/api/orders/[id]/timeline.pdf`) — ne la connaissait pas. Elle rend TOUS
 * les événements, sans filtre de `kind`.
 *
 * ⚠️ CE N'ÉTAIT PAS UN RISQUE THÉORIQUE. `SINALITE_SUBMIT_UNCERTAIN`, livré en
 * #582/#583 et déployé, n'a jamais eu de libellé dans `timeline-pdf.ts` : un
 * client dont la soumission est partie sans réponse peut télécharger un PDF
 * en-tête « Plio · Démocratik inc. » où s'imprime, en toutes lettres,
 * `SINALITE_SUBMIT_UNCERTAIN`. C'est la régression [49] — déjà corrigée une
 * fois pour `CANCEL_REQUESTED` — rejouée parce que la connaissance n'était pas
 * partagée.
 */

/**
 * Événements d'EXPLOITATION : jamais montrés au client, sur aucune surface.
 *
 * Le critère n'est pas « c'est une mauvaise nouvelle » mais « le client ne
 * peut rien en faire, et l'apprendre ainsi l'inquiéterait sans lui donner de
 * prise ». Chacun a son canal humain : une alerte admin qui nomme le geste.
 */
export const EVENEMENTS_INTERNES: readonly string[] = [
  // Détail technique d'un incident de traitement.
  'ERROR',
  // « Une soumission est partie sans réponse » : information d'exploitation.
  // La commande s'avère le plus souvent parfaitement soumise.
  'SINALITE_SUBMIT_UNCERTAIN',
  'SINALITE_SUBMIT_UNCERTAIN_CLEARED',
  // Le client a reçu « Remboursement : X $ » par courriel et n'aura aucun avis
  // automatique de l'échec : le bon canal est un contact humain, et c'est ce
  // que l'alerte critique demande explicitement à l'admin.
  'REFUND_FAILED',
  // La contestation est entre Plio et la banque, et c'est le client qui l'a
  // ouverte — il n'apprend rien ici.
  'PAYMENT_DISPUTED',
];

/** `true` si cet événement peut être montré au client. */
export function visiblePourClient(kind: string): boolean {
  return !EVENEMENTS_INTERNES.includes(kind);
}
