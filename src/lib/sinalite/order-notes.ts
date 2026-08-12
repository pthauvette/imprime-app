/**
 * Champs libres envoyés à Sinalite — `notes` (commande) et `extra` (article).
 * SOURCE UNIQUE pour les deux chemins de commande.
 *
 * POURQUOI. Les deux chemins avaient chacun leur composition, et elles avaient
 * divergé :
 *
 *   | | web (checkout) | MCP |
 *   | préfixe « Livraison: » | oui | non |
 *   | plafond de longueur    | 500 | AUCUN |
 *   | numéro de commande     | non | non |
 *   | `extra` par article    | non | oui |
 *
 * L'absence de plafond côté MCP est le point sérieux : un champ libre non borné
 * part vers un système tiers. Et aucun des deux ne portait le numéro de commande
 * Plio, alors que c'est exactement ce qu'on veut lire sur un bon de production
 * quand on appelle l'atelier.
 *
 * ⚠️ POURQUOI L'INJECTION SE FAIT À LA SOUMISSION, PAS À LA CRÉATION.
 * Le chemin web fige un INSTANTANÉ du payload (`Order.sinalitePayload`) AVANT
 * le paiement, puis le rejoue tel quel une fois Stripe confirmé. Or l'id de la
 * commande Plio n'existe pas encore à ce moment-là. On garde donc l'instantané
 * intact — c'est lui qui porte les articles et les montants, et il ne doit pas
 * bouger — et on n'ajoute la référence qu'au moment de soumettre. Aucun champ
 * de prix ni d'article n'est touché : uniquement du texte libre.
 *
 * ⚠️ DONNÉES PERSONNELLES. `shippingNote` est saisi par le CLIENT. Il peut y
 * écrire n'importe quoi — un code d'immeuble, un numéro de téléphone, le nom de
 * sa voisine. On nettoie et on borne avant d'envoyer chez le fournisseur, sans
 * chercher à deviner ce qui est sensible : la limite de longueur et le retrait
 * des caractères de contrôle sont ce qu'on peut garantir.
 */

/** Plafond volontairement identique pour les deux chemins. */
export const NOTES_MAX = 500;
/** `extra` est une référence, pas un message : court à dessein. */
export const EXTRA_MAX = 64;

/**
 * Remplace les demi-surrogates orphelins par U+FFFD.
 *
 * Équivalent de `String.prototype.toWellFormed()` (ES2024) — écrit à la main
 * parce que la cible `lib` du projet ne l'expose pas, et que déplacer la cible
 * du dépôt entier pour trois lignes serait un changement bien plus large que
 * le problème.
 *
 * POURQUOI ÇA COMPTE. `JSON.parse` accepte `"\ud83d"` isolé, Zod le valide,
 * Postgres le stocke (échappé en ASCII) — et le `json_decode` du fournisseur
 * le REFUSE (`JSON_ERROR_UTF16`). L'échec tomberait donc à la SOUMISSION,
 * c'est-à-dire après encaissement : remboursement automatique, et une alerte
 * qui ressemble trait pour trait à une panne fournisseur.
 */
export function bienForme(s: string): string {
  return s.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '\uFFFD',
  );
}

/**
 * Nettoie un texte libre destiné à un système tiers : caractères de contrôle
 * retirés, espaces normalisés, longueur bornée.
 */
export function nettoyerTexteLibre(brut: string | null | undefined, max: number): string {
  if (!brut) return '';
  // ⚠️ UNE SEULE implémentation de coupe, `couperSansCasser`. Le jet précédent
  // en avait deux : une coupe en points de code PUIS une coupe en unités
  // UTF-16 appliquée APRÈS la seule réparation — elle pouvait donc trancher au
  // milieu d'une paire et RECRÉER l'orphelin qu'on venait de retirer, pendant
  // que le commentaire affirmait l'inverse. Deux implémentations d'une même
  // règle finissent toujours par diverger ; celle-ci ne pouvait diverger que
  // d'elle-même.
  return couperSansCasser(
    bienForme(brut)
      // Demi-surrogates DÉJÀ présents en entrée : `JSON.parse` les accepte,
      // Zod aussi, Postgres aussi (échappés en ASCII) — et le `json_decode`
      // du fournisseur les REFUSE. L'échec arriverait sur une commande déjà
      // payée, donc remboursement automatique et alerte qui ressemble à une
      // panne fournisseur. Le commentaire promettait cette garantie ; il a
      // fallu ce correctif pour que le code la donne.
      // Caractères de contrôle, en échappements EXPLICITES : écrits
      // littéralement ils survivent mal aux copies et aux outils, et un régex
      // silencieusement vidé ne nettoie plus rien.
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      // `.slice()` coupe des unités UTF-16 : tronquer au milieu d'un emoji
      // laisse un demi-surrogate. `JSON.stringify` l'échappe sans broncher,
      // mais un `json_decode` côté fournisseur le refuse — et l'échec
      // arriverait sur une commande DÉJÀ PAYÉE.
      .trim(),
    max,
  );
}

/**
 * Coupe une chaîne sans casser de paire de substitution ET sans toucher au
 * contenu (les sauts de ligne survivent).
 */
export function couperSansCasser(s: string, max: number): string {
  const points = s.match(/[\s\S]/gu) ?? [];
  return bienForme(points.slice(0, max).join('').slice(0, max));
}

/**
 * Référence de commande lisible par un humain à l'atelier.
 * Même dérivation que le `displayId` (6 derniers caractères, en majuscules).
 *
 * ⚠️ Ce n'est PAS « le numéro que le client a sous les yeux » : dès qu'un
 * `sinaliteOrderId` existe — c'est-à-dire exactement quand un bon de production
 * existe — le client voit `#SIN-<id>` partout (confirmation, courriels, PDF).
 * L'intérêt de cette référence est la recherche côté ADMIN, pas la citation
 * client. Un commentaire faux sur le chemin money, c'est le terreau de #357.
 */
export function referencePlio(orderId: string): string {
  return `PLIO-${orderId.slice(-6).toUpperCase()}`;
}

/**
 * Compose le champ `notes`. La référence vient EN PREMIER : si le texte est
 * tronqué à l'affichage sur un bon de production, c'est elle qu'on veut voir.
 */
export function composerNotes(input: {
  orderId?: string | null;
  shippingNote?: string | null;
  notes?: string | null;
}): string | undefined {
  const parts: string[] = [];
  if (input.orderId) parts.push(`Réf. ${referencePlio(input.orderId)}`);

  const livraison = nettoyerTexteLibre(input.shippingNote, NOTES_MAX);
  if (livraison) parts.push(`Livraison: ${livraison}`);

  const autres = nettoyerTexteLibre(input.notes, NOTES_MAX);
  if (autres) parts.push(autres);

  if (parts.length === 0) return undefined;
  // ⚠️ NE PAS repasser le tout dans `nettoyerTexteLibre` : son
  // `.replace(/\s+/g, ' ')` écraserait les sauts de ligne qui SÉPARENT la
  // référence, la note de livraison et les notes générales — l'atelier
  // recevrait tout collé sur une ligne. Chaque partie est déjà nettoyée ;
  // il ne reste qu'à couper, en préservant les `\n`.
  return couperSansCasser(parts.join('\n'), NOTES_MAX);
}

/**
 * Enrichit un instantané de payload avant SOUMISSION à Sinalite.
 *
 * ⚠️ SEULE DÉVIATION AUTORISÉE par rapport à `Order.sinalitePayload`.
 * L'instantané porte les articles, options, fichiers et montants : il est
 * rejoué TEL QUEL, et le garde de montant en dépend. On n'ajoute ici que du
 * TEXTE LIBRE — la référence de commande, qui n'existait pas quand
 * l'instantané a été figé (l'id est généré à l'insertion).
 *
 * ⚠️ UNE SEULE FONCTION POUR LES DEUX CHEMINS DE SOUMISSION : le webhook
 * Stripe ET le rejeu admin (`/api/admin/orders/[id]/replay-sinalite`). Le
 * premier jet n'enrichissait que le webhook — donc le bon de production SANS
 * numéro citable était celui né d'un rejeu manuel d'une commande échouée,
 * c'est-à-dire le cas où l'on a le plus besoin d'appeler l'atelier.
 */
export function enrichirPayloadSoumis<
  T extends { items: { extra?: string }[]; notes?: string },
>(instantane: T, orderId: string): T {
  const notes = composerNotes({ orderId, notes: instantane.notes });
  return {
    ...instantane,
    // ⚠️ ON N'INJECTE PLUS DE RÉFÉRENCE D'ARTICLE, et c'est une correction.
    // Le checkout web envoie DÉJÀ un `internalRef` sur chaque article
    // (`order/review/page.tsx` : le bon de commande du client, sinon un
    // `PLIO-<horodatage>-<rang>` autogénéré). Le repli que portait le premier
    // jet était donc du code mort sur ~100 % des commandes web, tout en
    // exposant un risque non validé : un `extra` peuplé partout n'a jamais été
    // éprouvé auprès du fournisseur, et s'il le refusait, TOUTES les commandes
    // payées échoueraient à la soumission. La référence de commande vit dans
    // `notes`, pour 100 % des commandes. Ce qu'on garde ici, c'est le
    // NETTOYAGE — `extra` est du texte client, il doit être borné.
    items: instantane.items.map((item) => {
      // Un `extra` valant « \u0000 » ou «␣␣␣ » est truthy mais se nettoie en
      // chaîne vide : on omettrait alors le champ… en envoyant `extra: ""`.
      // On teste le RÉSULTAT du nettoyage, pas l'entrée.
      const extra = nettoyerTexteLibre(item.extra, EXTRA_MAX);
      return { ...item, ...(extra ? { extra } : {}) };
    }),
    ...(notes ? { notes } : {}),
  };
}
