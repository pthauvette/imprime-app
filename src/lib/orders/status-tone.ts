/**
 * OrderStatus → ton sémantique — Round 43 #2.
 *
 * Source de vérité UNIQUE pour la couleur d'un statut de commande, partagée
 * par /account, /orders/[id], /admin/orders. Avant : 3 records STATUS_CLASS
 * locaux contradictoires (admin rendait SHIPPED en vert et DELIVERED en gris,
 * alors que le customer rendait SHIPPED en bleu et DELIVERED en vert).
 *
 * Canon retenu = la sémantique customer (majoritaire + juste : livré = vert,
 * expédié = bleu/info, en production = orange/warning). admin/orders s'aligne
 * dessus ; /account ne change pas.
 *
 * Le label reste dans status-labels.ts (STATUS_LABELS) — séparé car déjà
 * consommé ailleurs (payments, track) ; ici on ne traite que le TON.
 */

import type { OrderStatus } from '@/lib/db/orders';
import type { Tone } from '@/lib/ui/status-tone';

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDING: 'neutral',
  PAID: 'accent',
  SUBMITTED: 'accent',
  IN_PRODUCTION: 'warning',
  SHIPPED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  FAILED: 'danger',
};

/** Safe lookup : ton connu sinon neutral (défensif vs status legacy hors enum). */
export function orderStatusTone(status: string): Tone {
  return ORDER_STATUS_TONE[status as OrderStatus] ?? 'neutral';
}
