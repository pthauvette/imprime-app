/**
 * Single source of truth pour les labels FR des Order.status.
 *
 * Round 37 #5 — Audit Round 36+1 a flag : ce mapping était dupliqué dans
 * 7 fichiers avec divergence ("Soumise" vs "Envoyée" pour SUBMITTED).
 * Maintenant centralisé → 1 update propagate partout.
 *
 * Utilisation :
 *   import { STATUS_LABELS } from '@/lib/orders/status-labels';
 *   <span>{STATUS_LABELS[order.status]}</span>
 *
 * Compat : si une route admin reçoit un status string brut hors enum
 * (ex: legacy DB), le helper retourne le status as-is.
 */

import type { OrderStatus } from '@/lib/db/orders';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  PAID: 'Payée',
  SUBMITTED: 'Soumise',
  IN_PRODUCTION: 'En production',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  FAILED: 'Échec',
};

/**
 * CSS class names cohérents pour les status badges (used dans /orders,
 * /admin/orders, /track, /payments). Mapping 1:1 avec STATUS_LABELS.
 */
export const STATUS_CLASS: Record<OrderStatus, string> = {
  PENDING: 'status-pending',
  PAID: 'status-paid',
  SUBMITTED: 'status-submitted',
  IN_PRODUCTION: 'status-in-production',
  SHIPPED: 'status-shipped',
  DELIVERED: 'status-delivered',
  CANCELLED: 'status-cancelled',
  FAILED: 'status-failed',
};

/** Helper safe : retourne le label si connu, sinon le raw status (defensive). */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status as OrderStatus] ?? status;
}
