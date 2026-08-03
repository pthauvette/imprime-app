/**
 * Résumé lisible des options SÉLECTIONNÉES pour l'écran de paiement.
 *
 * Avant (finding [26]/[31]/[115], docs/experience-client-2026-07.md) :
 * /order/review affichait « 6 options · 1 fichier(s) » — sur une commande
 * non annulable de 200$+, impossible de vérifier qu'on n'a pas payé pour
 * la mauvaise finition. Le serveur RÉSOUT déjà les noms d'option (via
 * `/api/products/[id]` → optionGroups), juste jamais affiché ici.
 *
 * ⚠️ Le mapping de groupe était DUPLIQUÉ ici, « intentionnellement », au motif
 * qu'un résumé de paiement ne devait pas dépendre d'un fichier d'UI. La copie a
 * divergé : le configurateur disait « Coins arrondis », cet écran-ci « Coins »,
 * pour le même groupe — et les VALEURS restaient brutes (« Délai : 2 - 3
 * Business Days ») sur l'écran juste avant le paiement. Le dictionnaire vit
 * désormais dans `option-i18n.ts`, hors UI, consommé par les trois surfaces.
 */

import { groupLabelFr, optionValueOrRaw } from './option-i18n';

interface OptionLike {
  id: number;
  group: string;
  name: string;
}

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
    .map((opt) => {
      const noms = optionGroups[opt.group]?.map((o) => o.name);
      return `${groupLabelFr(opt.group, noms)} : ${optionValueOrRaw(opt.group, opt.name)}`;
    });
}
