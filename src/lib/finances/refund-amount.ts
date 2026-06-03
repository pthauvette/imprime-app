/**
 * Montant réellement remboursé d'un OrderEvent REFUND_ISSUED (Audit v2 #10.6).
 *
 * Avant : le dashboard finances sommait `order.amountCents` (TOTAL de la
 * commande) pour chaque refund → un refund PARTIEL (20 $ sur 80 $) comptait
 * 80 $ → revenu net (rev − refunds) faussé à la baisse.
 *
 * Depuis le fix, `markRefundIssued` stocke `amountCents` (= refund.amount
 * Stripe) dans `OrderEvent.data`. On le lit ici ; fallback sur le total de la
 * commande pour les events ANTÉRIEURS au fix (qui n'ont que { refundId }).
 */
export interface RefundEventLike {
  data: string | null;
  order: { amountCents: number } | null;
}

export function refundAmountCentsOf(ev: RefundEventLike): number {
  if (ev.data) {
    try {
      const parsed = JSON.parse(ev.data) as { amountCents?: unknown };
      if (typeof parsed.amountCents === 'number' && Number.isFinite(parsed.amountCents)) {
        return parsed.amountCents;
      }
    } catch {
      // data malformé → fallback ci-dessous
    }
  }
  return ev.order?.amountCents ?? 0;
}
