/**
 * Tools MCP POST-commande (lecture) : statut, historique, re-commande.
 *
 * ⚠️ INVARIANT D'AUTORISATION — chaque fonction reçoit le `userId` AUTHENTIFIÉ
 * (requireUser côté route) et ne retourne JAMAIS une commande qui ne lui
 * appartient pas. `getOrderById` charge par id SEUL (pas de filtre user) → on
 * re-vérifie `order.userId === userId` et on traite tout écart comme
 * « introuvable » (aucune fuite d'existence), même règle que
 * /order/start?reorder=. Ces tools sont READ-ONLY et ne touchent aucun chemin
 * money (ils composent des helpers de lecture existants).
 */

import { getOrderById, listOrdersForUser } from '@/lib/db/orders';
import { buildReorderDeepLink } from '@/lib/orders/reorder';
import { extractTracking, computeOrderEta, type TrackingInfo } from '@/lib/orders/timeline';
import { statusLabel } from '@/lib/orders/status-labels';
import { parseItemsSnapshot, shortItemSummary } from '@/lib/orders/items';
import { formatCents } from '@/lib/format';

/** Base URL de l'app (sans slash final) — même source que create-order (Mode A). */
const APP_BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.plio.ca').replace(/\/+$/, '');

// ─── Historique ─────────────────────────────────────────────────────────────

export interface OrderSummaryView {
  id: string;
  placedAtIso: string;
  status: string;
  statusLabel: string;
  summary: string;
  totalCents: number;
}

/** Résumé des commandes RÉCENTES du user authentifié (les plus récentes d'abord). */
export async function listUserOrders(userId: string, limit = 10): Promise<OrderSummaryView[]> {
  const orders = await listOrdersForUser({ userId, limit });
  return orders.map((o) => ({
    id: o.id,
    placedAtIso: o.createdAt.toISOString(),
    status: o.status,
    statusLabel: statusLabel(o.status),
    summary: o.productSummary?.trim() || `${o.itemsCount} article${o.itemsCount > 1 ? 's' : ''}`,
    totalCents: o.amountCents,
  }));
}

export function formatOrdersListText(orders: OrderSummaryView[]): string {
  if (orders.length === 0) {
    return "Aucune commande pour l'instant. Configure un produit pour passer ta première commande sur plio.ca.";
  }
  const lines = [`Tes ${orders.length} dernière${orders.length > 1 ? 's' : ''} commande${orders.length > 1 ? 's' : ''} :`, ''];
  for (const o of orders) {
    const date = new Date(o.placedAtIso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
    lines.push(`• #${o.id} — ${o.statusLabel} · ${date}`);
    lines.push(`  ${o.summary} — ${formatCents(o.totalCents)}`);
  }
  lines.push('', "Demande « statut de la commande #<id> » pour le suivi détaillé, ou « recommander #<id> » pour la refaire.");
  return lines.join('\n');
}

// ─── Statut détaillé ─────────────────────────────────────────────────────────

export interface OrderStatusView {
  id: string;
  status: string;
  statusLabel: string;
  placedAtIso: string;
  items: string[];
  totalCents: number;
  shipTo: string;
  tracking: TrackingInfo | null;
  eta: { day: string; relative: string } | null;
}

export type OrderStatusResult =
  | { ok: true; view: OrderStatusView }
  | { ok: false; notFound: true };

/** Statut détaillé d'UNE commande — vérifie l'appartenance au user authentifié. */
export async function getUserOrderStatus(userId: string, orderId: string): Promise<OrderStatusResult> {
  const order = await getOrderById(orderId);
  // Introuvable OU pas au user → « introuvable » (aucune fuite d'existence).
  if (!order || order.userId !== userId) return { ok: false, notFound: true };

  const items = parseItemsSnapshot(order.itemsSnapshot);
  const itemLines = items && items.length > 0
    ? items.map(shortItemSummary)
    : [order.productSummary?.trim() || `${order.itemsCount} article(s)`];

  const shippedAt = extractShippedAt(order.events);

  return {
    ok: true,
    view: {
      id: order.id,
      status: order.status,
      statusLabel: statusLabel(order.status),
      placedAtIso: order.createdAt.toISOString(),
      items: itemLines,
      totalCents: order.amountCents,
      shipTo: `${order.shipCity}, ${order.shipProvince}`,
      tracking: extractTracking(order.events),
      eta: computeOrderEta(order, shippedAt),
    },
  };
}

export function formatOrderStatusText(view: OrderStatusView): string {
  const date = new Date(view.placedAtIso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [
    `Commande #${view.id} — ${view.statusLabel}`,
    `Passée le ${date} · livrée à ${view.shipTo} · total ${formatCents(view.totalCents)}`,
    '',
    'Articles :',
    ...view.items.map((i) => `  • ${i}`),
  ];
  if (view.tracking) {
    lines.push('', `Suivi : ${view.tracking.carrier} ${view.tracking.number}`);
    if (view.tracking.url) lines.push(view.tracking.url);
  }
  if (view.eta) {
    lines.push('', view.status === 'DELIVERED'
      ? `Livrée (${view.eta.day}).`
      : `Livraison estimée : ${view.eta.day} (${view.eta.relative}).`);
  }
  return lines.join('\n');
}

// ─── Re-commande ─────────────────────────────────────────────────────────────

export type ReorderResult =
  | { ok: true; url: string }
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; reason: string };

/**
 * Deep-link de re-commande — vérifie l'appartenance, puis reconstruit l'URL du
 * wizard pré-remplie depuis le payload Sinalite de la commande (réutilise
 * buildReorderDeepLink, la même logique que le bouton « Recommander » du site).
 * Handoff sûr : aucun paiement, l'humain re-téléverse le fichier + paie sur plio.ca.
 */
export async function buildUserReorderLink(userId: string, orderId: string): Promise<ReorderResult> {
  const order = await getOrderById(orderId);
  if (!order || order.userId !== userId) return { ok: false, notFound: true };

  const link = buildReorderDeepLink(order.sinalitePayload);
  if (!link.ok) {
    // Payload illisible → fallback : la page start résout ce qu'elle peut.
    return { ok: false, notFound: false, reason: link.reason };
  }
  // buildReorderDeepLink renvoie un chemin relatif (/order/configure?…) → absolutise.
  const url = link.url.startsWith('http') ? link.url : `${APP_BASE}${link.url}`;
  return { ok: true, url };
}

export function formatReorderText(orderId: string, result: ReorderResult): string {
  if (result.ok) {
    return [
      `Voici ton lien pour recommander la commande #${orderId} :`,
      result.url,
      '',
      'Il rouvre le configurateur pré-rempli (produit + options). Tu re-téléverses ton fichier et tu paies sur plio.ca — le prix est recalculé au checkout.',
    ].join('\n');
  }
  if (result.notFound) return `Commande #${orderId} introuvable sur ton compte.`;
  return `Impossible de reconstruire cette commande (${result.reason}). Ouvre ${APP_BASE}/order/start pour recommencer.`;
}

// ─── Interne ─────────────────────────────────────────────────────────────────

/** Date d'expédition = createdAt du dernier event SINALITE dont le status = SHIPPED. */
function extractShippedAt(events: { kind: string; data: string | null; createdAt: Date }[]): Date | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind !== 'SINALITE_STATUS_CHANGED' || !e.data) continue;
    try {
      const parsed = JSON.parse(e.data) as { status?: string };
      if (String(parsed.status ?? '').toUpperCase() === 'SHIPPED') return e.createdAt;
    } catch {
      continue;
    }
  }
  return null;
}
