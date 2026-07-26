/**
 * /order/confirmation — résolution PURE de ce qu'on affiche/où on pointe le
 * CTA, à partir de l'Order (déjà créé par createReservedOrder AVANT la
 * redirection Stripe) et de la session courante (peut être absente —
 * checkout invité).
 *
 * Extrait en fonction pure et testée séparément parce que `isOwner` est une
 * décision d'autorisation : router un user (même connecté) vers
 * `/orders/<id>` d'une commande qui N'EST PAS la sienne serait un leak.
 * Cf. docs/experience-client-2026-07.md finding [40]/[59].
 */

export interface ConfirmationOrderInput {
  id: string;
  sinaliteOrderId: string | null;
  productSummary: string | null;
  itemsCount: number;
  userId: string;
}

export interface ConfirmationOrderView {
  displayId: string;
  productLabel: string;
  isOwner: boolean;
  trackingHref: string;
}

export function resolveConfirmationView(
  order: ConfirmationOrderInput | null,
  sessionUserId: string | null | undefined,
): ConfirmationOrderView | null {
  if (!order) return null;

  const displayId = order.sinaliteOrderId
    ? `#SIN-${order.sinaliteOrderId}`
    : `#${order.id.slice(-6).toUpperCase()}`;

  const productLabel = order.productSummary
    ?? `${order.itemsCount} article${order.itemsCount > 1 ? 's' : ''}`;

  // Un checkout invité n'ouvre PAS de session ; un user connecté peut aussi
  // être en train de payer une commande pour un AUTRE compte (rare, mais
  // possible via un lien partagé) — dans les deux cas, /orders/[id] serait
  // soit un redirect sign-in (invité) soit un leak (mauvais owner). /track
  // est le parcours self-serve prévu pour ça (numéro + email, sans compte).
  const isOwner = Boolean(sessionUserId && order.userId === sessionUserId);
  const trackingHref = isOwner ? `/orders/${order.id}` : '/track';

  return { displayId, productLabel, isOwner, trackingHref };
}
