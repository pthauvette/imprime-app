/**
 * Prix vitrine dynamique — Audit v2 #8.7.
 *
 * La home affichait un badge figé « 0,08 $/carte à 1 000 u » et /pricing une FAQ
 * « ~0,12 $/u à 1000 » : deux chiffres HARDCODÉS et incohérents entre eux, qui
 * dérivaient dès que la marge admin ou le tarif Sinalite changeait.
 *
 * Le prix réel = coût Sinalite (fournisseur) + marge admin. On le calcule donc à
 * la volée à partir des MÊMES sources que le wizard (getProductDetail + index
 * enrichi markup-inclus), pour que le badge promette exactement le tarif que le
 * client verra à l'étape Quantité.
 *
 * Ce module n'expose QUE la logique pure (pas de fetch) → testable sans Sinalite.
 * Le fetch + cache vit dans le Server Component appelant.
 */

import type { SinaliteOption } from '@/lib/sinalite/types';

/** Carte d'affaires standard — cf. src/lib/templates/business-cards.ts. */
export const BUSINESS_CARD_PRODUCT_ID = 1;

export interface BestUnitPrice {
  /** Meilleur prix par unité, en cents (markup admin inclus). */
  unitPriceCents: number;
  /** Quantité à laquelle ce tarif/unité est atteint (le plancher). */
  atQuantity: number;
}

/**
 * Indexe les options du groupe `qty` : optionId → quantité numérique.
 * Ignore les qty cachées par l'admin (mêmes que le wizard masque) et les noms
 * non numériques.
 */
export function quantityByOptionId(
  options: readonly SinaliteOption[],
  hiddenOptionIds: ReadonlySet<number> = new Set(),
): Map<number, number> {
  const byId = new Map<number, number>();
  for (const o of options) {
    if (o.group !== 'qty' || hiddenOptionIds.has(o.id)) continue;
    const qty = Number(o.name);
    if (Number.isFinite(qty) && qty > 0) byId.set(o.id, qty);
  }
  return byId;
}

/**
 * Balaie l'index des variants et retourne le MEILLEUR prix par unité (le plancher
 * tarifaire, généralement atteint au plus gros tirage), avec la quantité associée.
 *
 * @param index    Map<cléTriée d'optionIds → prix TOTAL en dollars> (markup inclus).
 * @param qtyById  optionId → quantité (cf. quantityByOptionId).
 * @returns le meilleur $/unité + sa quantité, ou null si rien d'exploitable
 *          (Sinalite indisponible, aucune qty, ou index vide).
 */
/**
 * Prix TOTAL minimal parmi les variantes (markup admin inclus) — le « à partir
 * de » des listes produits. Contrairement à bestUnitPrice (plancher $/unité aux
 * gros tirages, pour le badge cartes), ici on veut le plus petit panier possible,
 * valable pour TOUS les types de produits (bannières, enseignes, dépliants…).
 * @returns cents, ou null si l'index est vide/inexploitable.
 */
export function minTotalCents(index: ReadonlyMap<string, number>): number | null {
  let min: number | null = null;
  for (const totalDollars of index.values()) {
    if (!(totalDollars > 0)) continue;
    const cents = Math.round(totalDollars * 100);
    if (min === null || cents < min) min = cents;
  }
  return min;
}

/**
 * Ordre de balayage du cron refresh-product-prices : les produits JAMAIS
 * calculés d'abord (nouveau catalogue → prix visibles au plus vite), puis du
 * plus vieux calcul au plus récent. Déterministe (tiebreak par id croissant)
 * pour que deux runs consécutifs ne se marchent pas dessus. PUR.
 */
export function refreshOrder(
  productIds: readonly number[],
  computedAtById: ReadonlyMap<number, Date>,
): number[] {
  return [...productIds].sort((a, b) => {
    const ta = computedAtById.get(a)?.getTime() ?? -1; // -1 = jamais calculé → en tête
    const tb = computedAtById.get(b)?.getTime() ?? -1;
    if (ta !== tb) return ta - tb;
    return a - b;
  });
}

export function bestUnitPrice(
  index: ReadonlyMap<string, number>,
  qtyById: ReadonlyMap<number, number>,
): BestUnitPrice | null {
  if (qtyById.size === 0) return null;

  let best: BestUnitPrice | null = null;
  for (const [key, totalDollars] of index) {
    if (!(totalDollars > 0)) continue;

    // Retrouve l'optionId du groupe qty dans la clé (un seul par variant).
    let qty: number | undefined;
    for (const idStr of key.split('-')) {
      const q = qtyById.get(Number(idStr));
      if (q !== undefined) { qty = q; break; }
    }
    if (qty === undefined) continue;

    const unitCents = (totalDollars * 100) / qty;
    if (best === null || unitCents < best.unitPriceCents) {
      best = { unitPriceCents: unitCents, atQuantity: qty };
    }
  }
  return best;
}
