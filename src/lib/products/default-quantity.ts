/**
 * Quantité par défaut du configurateur — finding [18].
 *
 * Avant : `sorted[Math.min(2, sorted.length - 1)]` (3e palier le plus PETIT,
 * par POSITION). Les listes de paliers Sinalite diffèrent selon le produit/la
 * finition (ex: [25,50,75,…] vs [100,250,500,…]) → deux finitions du MÊME
 * produit affichaient un prix d'ancrage jusqu'à 6× différent (75u vs 750u)
 * sans raison visible pour le client.
 *
 * Fix : choisir par VALEUR (le palier le plus proche d'une cible réaliste),
 * pas par position — cohérent peu importe la forme de la liste de paliers.
 */

export interface QuantityLikeOption {
  id: number;
  name: string;
}

/** Cible « réaliste » — pas le minimum trompeur, pas un volume industriel. */
export const DEFAULT_TARGET_QTY = 500;

/**
 * Retourne l'option dont la valeur numérique (`name`) est la plus proche de
 * `target`. `undefined` si `opts` est vide. Ordre d'entrée indifférent.
 */
export function pickDefaultQuantityOption<T extends QuantityLikeOption>(
  opts: T[],
  target: number = DEFAULT_TARGET_QTY,
): T | undefined {
  if (opts.length === 0) return undefined;
  return opts.reduce((best, o) =>
    Math.abs(Number(o.name) - target) < Math.abs(Number(best.name) - target) ? o : best,
  );
}
