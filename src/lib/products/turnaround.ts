/**
 * Extraction du délai de PRODUCTION (business days) depuis le libellé de
 * l'option Sinalite `Turnaround` — ex. "Next Business Day", "2 - 3 Business
 * Days", "5 jours". C'est le chiffre que le client a choisi ET payé à
 * l'étape 03 du wizard, mais qui n'était jamais ajouté à l'ETA affichée
 * (seul le transit transporteur l'était). Cf.
 * docs/experience-client-2026-07.md finding [17] — « la promesse la plus
 * vérifiable du produit, fausse par construction pour 100% des commandes ».
 *
 * Analyse le TEXTE plutôt qu'une table figée par ID : Sinalite n'expose pas
 * de champ structuré "jours", seulement un libellé humain — c'est la seule
 * source fiable, et elle marche identiquement en sandbox et en live.
 */

/**
 * Renvoie le nombre de jours ouvrables, ou `null` si le libellé ne
 * ressemble à aucun format connu (fail-safe : l'appelant retombe alors sur
 * le comportement actuel — transit seul — plutôt que d'inventer un chiffre).
 *
 * Sur une plage ("2 - 3 Business Days"), on prend le MAX : mieux vaut
 * annoncer un jour de trop au client (bonne surprise) qu'un jour de moins
 * (plainte).
 */
export function parseTurnaroundDays(name: string): number | null {
  const n = name.trim().toLowerCase();

  if (/\bnext\b|\bsame[\s-]?day\b/.test(n)) return 1;

  // Plage : "2 - 3 business days", "2-3 jours"
  const range = n.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return Math.max(Number(range[1]), Number(range[2]));

  // Nombre seul : "5 jours", "3 business days"
  const single = n.match(/(\d+)\s*(jour|business\s*day)/);
  if (single) return Number(single[1]);

  return null;
}

/**
 * Compose l'ETA affichée = date de commande + PRODUCTION + TRANSIT, en
 * jours ouvrables. Renvoie les deux segments séparément pour que l'UI
 * puisse dire « 2 jours de production + 2 jours de livraison » plutôt
 * qu'une seule date opaque.
 */
export function computeDeliveryDate(
  from: Date,
  productionDays: number,
  transitDays: number,
): { eta: Date; productionDays: number; transitDays: number } {
  const eta = addBusinessDays(from, productionDays + transitDays);
  return { eta, productionDays, transitDays };
}

function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}
