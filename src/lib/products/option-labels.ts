/**
 * Résumé lisible des options SÉLECTIONNÉES pour l'écran de paiement.
 *
 * Avant (finding [26]/[31]/[115], docs/experience-client-2026-07.md) :
 * /order/review affichait « 6 options · 1 fichier(s) » — sur une commande
 * non annulable de 200$+, impossible de vérifier qu'on n'a pas payé pour
 * la mauvaise finition. Le serveur RÉSOUT déjà les noms d'option (via
 * `/api/products/[id]` → optionGroups), juste jamais affiché ici.
 *
 * Reprend le même mapping de groupe que ConfigureClient.tsx (friendlyLabel)
 * et mcp/tools/configure.ts (groupLabel) — dupliqué intentionnellement en
 * mini-dictionnaire local plutôt qu'importé : ce résumé est un texte de
 * confirmation FIGÉ pour le client, pas un composant de config interactif ;
 * le faire dépendre d'un fichier UI ailleurs serait un couplage superflu.
 */

interface OptionLike {
  id: number;
  group: string;
  name: string;
}

const GROUP_LABELS: Record<string, string> = {
  size: 'Format',
  Stock: 'Papier',
  Coating: 'Finition',
  Turnaround: 'Délai',
  'Round Corners': 'Coins',
  Scoring: 'Pliage (scoring)',
  Bundling: 'Bundling',
  Folding: 'Pliage',
  Color: 'Couleur',
};

/**
 * `optionIds` sélectionnés + `optionGroups` (toutes les options possibles du
 * produit, par groupe) → labels lisibles ["Papier: 14pt", "Finition: Mat", …].
 * Un optionId non trouvé (drift Sinalite, groupe non mappé) est simplement
 * omis — jamais de placeholder cryptique dans un résumé de paiement.
 */
export function buildOptionSummary(
  optionIds: number[],
  optionGroups: Record<string, OptionLike[]>,
): string[] {
  const byId = new Map<number, OptionLike>();
  for (const options of Object.values(optionGroups)) {
    for (const opt of options) byId.set(opt.id, opt);
  }

  return optionIds
    .map((id) => byId.get(id))
    .filter((opt): opt is OptionLike => opt !== undefined)
    .filter((opt) => opt.group !== 'qty') // la quantité a déjà sa propre ligne
    .map((opt) => `${GROUP_LABELS[opt.group] ?? opt.group}: ${opt.name}`);
}
