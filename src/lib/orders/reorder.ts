/**
 * Helpers pour la fonctionnalité "Recommander" — créer une nouvelle commande
 * en repartant d'une commande existante.
 *
 * Stratégie : on extrait productId + options de la sinalitePayload de
 * l'order, on construit l'URL de deep-link vers le wizard. L'user complète
 * les étapes restantes (upload + shipping + paiement).
 *
 * Fichiers (finding [54]/[119], docs/experience-client-2026-07.md) — le
 * paramètre `?files=` existe et fonctionne déjà (thread upload↔shipping↔
 * configure, cf. lib/order/files-param.ts), mais n'était jamais porté ICI :
 * le client devait retrouver et re-téléverser son PDF à chaque réachat.
 * On le réutilise maintenant, MAIS avec une garde de fraîcheur : les
 * fichiers sont purgés de S3 après 90 jours (upload/page.tsx, lifecycle
 * policy). Sans cette garde, réutiliser aveuglément un vieux lien casserait
 * silencieusement le réachat (URL morte) au lieu de forcer un nouvel
 * upload — on remplacerait un problème connu par un pire, invisible.
 *
 * À call depuis :
 *   - /order/start?reorder=ORDER_ID (depuis l'email delivered)
 *   - Bouton "Recommander" sur /orders/[id] (customer)
 *   - Bouton "Recommander pour client" sur /admin/orders/[id] (admin)
 */

import { buildFilesParam } from '@/lib/order/files-param';

/** Marge de sécurité sous la purge S3 réelle (90j) — évite les faux positifs
 *  « encore frais » sur des commandes à la limite. */
const FILE_FRESHNESS_DAYS = 85;

/** Shape minimal qu'on attend dans Order.sinalitePayload (string JSON). */
interface SinalitePayloadShape {
  items: Array<{
    productId: number;
    options: Record<string, string>;
    files?: Array<{ type?: string; url?: string }>;
  }>;
}

export type ReorderDeepLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid-payload' | 'no-items' | 'parse-error' };

/**
 * Construit le deep-link vers le wizard à partir d'un Order.
 * Format URL : /order/configure?productId=X&options=ID1,ID2,...[&files=...]
 *
 * `orderCreatedAt` pilote la garde de fraîcheur des fichiers — passer la
 * date de création réelle de la commande, pas `new Date()` de l'appelant.
 *
 * Note : si la commande a plusieurs items, on ne prend que le premier
 * (le wizard actuel ne supporte qu'un produit par commande). L'user
 * créera les autres items en commandes séparées.
 */
export function buildReorderDeepLink(
  sinalitePayload: string,
  orderCreatedAt: Date,
): ReorderDeepLinkResult {
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

  let url = `/order/configure?productId=${firstItem.productId}&options=${optionIds.join(',')}`;

  const ageDays = (Date.now() - orderCreatedAt.getTime()) / (24 * 3600 * 1000);
  if (ageDays < FILE_FRESHNESS_DAYS && Array.isArray(firstItem.files)) {
    const frontUrl = firstItem.files.find((f) => f.type === 'front')?.url;
    const backUrl = firstItem.files.find((f) => f.type === 'back')?.url;
    const filesParam = buildFilesParam(frontUrl, backUrl);
    if (filesParam) url += `&files=${filesParam}`;
  }

  return { ok: true, url };
}
