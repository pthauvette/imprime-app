/**
 * Constantes de contenu marketing — SOURCE UNIQUE (Round 5 #1).
 *
 * La fenêtre de livraison était affichée de façon contradictoire (1-7 vs 4-5 vs
 * 4-7 jours) sur home / about / pricing / footers dupliqués. On la centralise
 * ici pour qu'un seul changement se propage partout et qu'aucune page ne dérive.
 *
 * Valeur canonique : « 1 à 7 jours » (couvre du rush 1 j au standard, livraison
 * partout au Canada). Décidée produit — ne pas modifier sans accord.
 */

/** Forme prose : « 1 à 7 jours ». Pour les phrases. */
export const DELIVERY_WINDOW = '1 à 7 jours';

/** Forme compacte : « 1 à 7 ». Pour les gros chiffres / stats (`{DELIVERY_DAYS} j`). */
export const DELIVERY_DAYS = '1 à 7';

/**
 * Surcoût rush/express — Round 5 #5. Le funnel calcule le vrai surcoût depuis
 * le pricing Sinalite (variable par produit/quantité) et l'affiche au devis :
 * on n'avance donc AUCUN chiffre durci côté marketing (les anciens « +12/+28 $ »
 * et « ~15-30 % » se contredisaient et étaient faux). Paliers : Standard /
 * Express / Rush.
 */
export const RUSH_SURCHARGE_NOTE = 'le surcoût exact s’affiche au devis selon le produit';

/**
 * SLA de réponse support affiché publiquement — Round 5 #3. Était incohérent
 * (4 h sur contact/ContactForm vs 2 h sur help ×3/about). Unifié sur « moins de
 * 4 heures ouvrables » : c'est déjà la valeur des emails transactionnels (la
 * promesse la plus engageante), et sous-promettre vaut mieux que rater pour une
 * marque qui vend la fiabilité. Pour repasser à 2 h, changer ici seulement.
 */
export const SUPPORT_SLA = 'moins de 4 heures ouvrables';
/** Forme courte : « < 4 h ouvrables » (badges, listes). */
export const SUPPORT_SLA_SHORT = '< 4 h ouvrables';
