/**
 * MCP tool — `estimate_shipping`.
 *
 * Coût de livraison (CAD) pour un produit configuré vers une destination CA.
 * Donne, avec get_print_quote, le coût TOTAL (produit + port).
 *
 * Réutilise la sélection d'options du devis (même productId + mêmes IDs que le
 * wizard) + `sinalite.estimateShipping` + `shippingQuoteToken` (HMAC anti-tamper,
 * porté plus tard jusqu'à create_order pour figer le prix de port).
 */
import { resolveVirtualProductId, getVirtualProduct } from '@/lib/products/virtual-products';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { sinalite } from '@/lib/sinalite/client';
import { shippingQuoteToken } from '@/lib/shipping/quote-token';
import type { CaProvince } from '@/lib/sinalite/types';
import { groupVisibleOptions, selectQuoteOptionIds } from './quote';

/**
 * Sinalite attend `options` = { clé: optionId } ; les CLÉS sont génériques (seules
 * les valeurs/IDs comptent pour le calcul poids/format). Même format que la page
 * shipping du wizard (`opt_0`, `opt_1`…). PUR → testable.
 */
export function buildSinaliteOptionsMap(optionIds: number[]): Record<string, string> {
  const map: Record<string, string> = {};
  optionIds.forEach((id, i) => { map[`opt_${i}`] = String(id); });
  return map;
}

export interface ShippingMethodResult {
  carrier: string;
  method: string;
  price: number;
  days: number;
  /** HMAC liant méthode+prix+destination+produits (anti-tamper au checkout). */
  sig: string;
}

export type ShippingResult =
  | { ok: true; methods: ShippingMethodResult[]; cheapest: ShippingMethodResult }
  | {
      ok: false;
      reason: 'unknown_product' | 'invalid_combo' | 'quantity_unavailable' | 'no_methods';
      message: string;
      availableQuantities?: number[];
    };

/** Estime la livraison pour (slug, papier, finition, quantité) → (province, code postal). */
export async function estimatePrintShipping(
  slug: string,
  paperKey: string,
  finishKey: string,
  quantityValue: number,
  province: CaProvince,
  postalCode: string,
): Promise<ShippingResult> {
  if (!getVirtualProduct(slug)) {
    return { ok: false, reason: 'unknown_product', message: `Produit inconnu : ${slug}.` };
  }
  const productId = resolveVirtualProductId(slug, paperKey, finishKey);
  if (productId === null) {
    return { ok: false, reason: 'invalid_combo', message: `Combinaison papier/finition invalide (${paperKey}/${finishKey}).` };
  }

  const [detail, enriched] = await Promise.all([
    sinalite.getProductDetail(productId),
    getEnrichedVariantIndex(productId),
  ]);
  const groups = groupVisibleOptions(detail.options, enriched.hiddenOptionIds);
  const sel = selectQuoteOptionIds(groups, quantityValue);
  if (!sel.ok) {
    return { ok: false, reason: 'quantity_unavailable', message: `Quantité ${quantityValue} indisponible.`, availableQuantities: sel.availableQuantities };
  }

  return reestimateShipping([{ productId, optionIds: sel.optionIds }], province, postalCode);
}

/**
 * Ré-estime la livraison pour des items DÉJÀ résolus (productId + optionIds).
 * Réutilisé par estimate_shipping ET (Mode B) create_order : le port est
 * recalculé côté SERVEUR via Sinalite pour la config exacte → on ne fait JAMAIS
 * confiance au prix de port fourni par l'agent (correctif #1 de la revue : le HMAC
 * ne signe pas la quantité, donc la seule défense fiable headless = re-estimer).
 */
export async function reestimateShipping(
  items: { productId: number; optionIds: number[] }[],
  province: CaProvince,
  postalCode: string,
): Promise<ShippingResult> {
  if (items.length === 0) {
    return { ok: false, reason: 'no_methods', message: 'Aucun article à livrer.' };
  }
  const result = await sinalite.estimateShipping({
    items: items.map((it) => ({ productId: it.productId, options: buildSinaliteOptionsMap(it.optionIds) })),
    shippingInfo: { ShipState: province, ShipZip: postalCode, ShipCountry: 'CA' },
  });

  const productIds = items.map((i) => i.productId);
  const methods: ShippingMethodResult[] = result.body
    .map(([carrier, method, price, days]) => ({
      carrier,
      method,
      price,
      days,
      sig: shippingQuoteToken({ method, price, country: 'CA', province, postal: postalCode, productIds }),
    }))
    .sort((a, b) => a.price - b.price);

  if (methods.length === 0) {
    return { ok: false, reason: 'no_methods', message: 'Aucune méthode de livraison pour cette destination.' };
  }
  return { ok: true, methods, cheapest: methods[0] };
}

/** Sélectionne la méthode choisie par l'agent dans une ré-estimation serveur.
 *  Mode B : on prend le PRIX SERVEUR de cette méthode, jamais celui de l'agent. */
export function selectShippingMethod(result: ShippingResult, methodName: string): ShippingMethodResult | null {
  if (!result.ok) return null;
  return result.methods.find((m) => m.method === methodName) ?? null;
}

export function formatShippingText(
  slug: string,
  province: string,
  postal: string,
  r: ShippingResult,
): string {
  if (!r.ok) {
    let msg = r.message;
    if (r.availableQuantities?.length) msg += `\nQuantités disponibles : ${r.availableQuantities.join(', ')}`;
    return `❌ ${msg}`;
  }
  const lines = [
    `Livraison Plio — ${slug} → ${province} ${postal}`,
    '',
    ...r.methods.map(
      (m) => `- **${m.method}** (${m.carrier}) : ${m.price.toFixed(2)} $ CAD · ~${m.days} jours ouvrables`,
    ),
    '',
    `_Le moins cher : ${r.cheapest.method} à ${r.cheapest.price.toFixed(2)} $. Taxes en sus._`,
  ];
  return lines.join('\n');
}
