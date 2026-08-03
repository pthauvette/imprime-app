/**
 * Tranche de l'index de variantes envoyée au NAVIGATEUR.
 *
 * POURQUOI : `/order/configure` sérialisait la matrice ENTIÈRE dans la charge
 * de la page pour que le prix réagisse sans appel réseau. Tant que l'index
 * était (accidentellement) plafonné à 1000 entrées, ça pesait ~22 Ko et
 * personne ne l'a vu. Une fois la pagination réparée, la même page enverrait
 * **403 Ko** pour un flyer et **1,9 Mo** pour le pire produit du catalogue —
 * sur le chemin d'achat, mobile compris.
 *
 * CE DONT LE CLIENT A RÉELLEMENT BESOIN (cf. ConfigureClient +
 * option-price-delta.ts), et rien de plus :
 *   1. la sélection courante à CHAQUE palier de quantité → le curseur reste
 *      instantané, et l'économie « vs palier précédent » s'affiche ;
 *   2. la sélection avec UNE option changée, à chaque palier → les deltas par
 *      option, et surtout : après un clic, la nouvelle sélection est DÉJÀ dans
 *      la tranche, donc le curseur reste instantané là aussi.
 *
 * Au-delà (deux options changées), `variantIndex[clé]` rend `undefined` et le
 * configurateur retombe sur `/api/products/[id]/price` — chemin qui existe
 * déjà, débounced et memoïsé côté serveur. On échange donc une charge de page
 * non bornée contre un appel réseau occasionnel.
 *
 * La taille est bornée par (1 + Σ(options−1)) × paliers, PAS par la taille de
 * la matrice : ~810 entrées (~18 Ko) pour le flyer, contre 18 780.
 */

import type { SinaliteOption } from '@/lib/sinalite/types';

/** Plafond dur — un produit aux groupes très fournis ne doit pas rouvrir la brèche. */
const MAX_ENTREES = 4_000;

function cleCanonique(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join('-');
}

/**
 * Extrait de `index` les seules combinaisons utiles au configurateur pour la
 * `selection` de départ. Les clés absentes de l'index sont simplement omises
 * (le client les traitera comme « à demander au serveur »).
 *
 * @param optionGroups groupes visibles, `qty` compris
 * @param selection    groupe → optionId (le défaut serveur ; `qty` ignoré ici)
 */
export function buildVariantSlice(
  optionGroups: Record<string, SinaliteOption[]>,
  selection: Record<string, number>,
  index: ReadonlyMap<string, number>,
): Record<string, number> {
  const qtyOptions = optionGroups['qty'] ?? [];
  const groupesNonQty = Object.keys(optionGroups).filter((g) => g !== 'qty' && optionGroups[g]!.length > 0);

  // Base = la sélection courante sur les groupes non-qty. Un groupe sans
  // sélection connue rend la tranche incalculable : on renvoie vide plutôt
  // qu'une tranche trompeuse (le repli distant prendra tout en charge).
  const base = new Map<string, number>();
  for (const g of groupesNonQty) {
    const id = selection[g];
    if (typeof id !== 'number') return {};
    base.set(g, id);
  }

  // Voisinage à UNE option près, base incluse.
  const combinaisons: number[][] = [[...base.values()]];
  for (const g of groupesNonQty) {
    for (const opt of optionGroups[g]!) {
      if (opt.id === base.get(g)) continue;
      const variante = new Map(base);
      variante.set(g, opt.id);
      combinaisons.push([...variante.values()]);
    }
  }

  const tranche: Record<string, number> = {};
  for (const combo of combinaisons) {
    for (const qty of qtyOptions) {
      if (Object.keys(tranche).length >= MAX_ENTREES) return tranche;
      const cle = cleCanonique([...combo, qty.id]);
      const prix = index.get(cle);
      if (prix !== undefined) tranche[cle] = prix;
    }
  }
  return tranche;
}
