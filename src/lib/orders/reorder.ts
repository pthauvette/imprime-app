/**
 * Helpers pour la fonctionnalité "Recommander" — créer une nouvelle commande
 * en repartant d'une commande existante.
 *
 * Stratégie : on extrait productId + options de la sinalitePayload de
 * l'order, on construit l'URL de deep-link vers le wizard. L'user complète
 * les étapes restantes (upload + shipping + paiement) — on ne ré-upload
 * pas automatiquement les fichiers (ils peuvent avoir expiré côté S3 +
 * c'est un bon contrôle qualité que l'user revérifie).
 *
 * À call depuis :
 *   - /order/start?reorder=ORDER_ID (depuis l'email delivered)
 *   - Bouton "Recommander" sur /orders/[id] (customer)
 *   - Bouton "Recommander pour client" sur /admin/orders/[id] (admin)
 */

/** Shape minimal qu'on attend dans Order.sinalitePayload (string JSON). */
interface SinalitePayloadShape {
  items: Array<{
    productId: number;
    options: Record<string, string>;
    files?: unknown;
  }>;
}

export type ReorderDeepLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid-payload' | 'no-items' | 'parse-error' };

/**
 * Construit le deep-link vers le wizard à partir d'un Order.
 * Format URL : /order/configure?productId=X&options=ID1,ID2,...
 *
 * Note : si la commande a plusieurs items, on ne prend que le premier
 * (le wizard actuel ne supporte qu'un produit par commande). L'user
 * créera les autres items en commandes séparées.
 */
export function buildReorderDeepLink(sinalitePayload: string): ReorderDeepLinkResult {
  let parsed: SinalitePayloadShape;
  try {
    parsed = JSON.parse(sinalitePayload) as SinalitePayloadShape;
  } catch {
    return { ok: false, reason: 'parse-error' };
  }

  if (!parsed.items || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    return { ok: false, reason: 'no-items' };
  }

  const firstItem = parsed.items[0];
  if (typeof firstItem.productId !== 'number' || !firstItem.options) {
    return { ok: false, reason: 'invalid-payload' };
  }

  // Options dans le payload Sinalite : { "Stock": "30", "size": "4", ... }
  // On veut juste les IDs pour reconstituer le state du wizard.
  const optionIds = Object.values(firstItem.options)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (optionIds.length === 0) {
    return { ok: false, reason: 'invalid-payload' };
  }

  const url = `/order/configure?productId=${firstItem.productId}&options=${optionIds.join(',')}`;
  return { ok: true, url };
}
