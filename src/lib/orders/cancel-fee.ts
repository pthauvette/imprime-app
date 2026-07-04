/**
 * Frais d'annulation Sinalite répercutés au client (alignement F2/F3).
 *
 * Sinalite facture des frais d'annulation (min. 25 $ PAR ARTICLE) une fois la
 * commande partie chez l'imprimeur (SUBMITTED/IN_PRODUCTION). L'admin peut choisir
 * de les répercuter (changement d'avis client) via l'opt-in `chargeCancelFee`.
 *
 * PUR + testable. Le frais sort UNIQUEMENT de la part carte : il est plafonné à
 * `amountCents` (= charge carte nette = grossTotal − crédits, cf. price-order.ts)
 * → jamais de remboursement négatif, jamais de ponction sur la part wallet/referral.
 */
export function computeCancelFeeCents(input: {
  /** Statut de la commande au moment de l'annulation. */
  status: string;
  /** Opt-in admin : répercuter les frais Sinalite. */
  chargeCancelFee: boolean;
  /** Charge carte nette de la commande (order.amountCents). */
  amountCents: number;
  /** Nombre d'articles = nombre de « jobs » Sinalite. */
  itemsCount: number;
  /** Frais par job (¢). Défaut env ORDER_CANCEL_FEE_CENTS ou 2500¢ (25 $). */
  perJobFeeCents?: number;
}): number {
  // Sinalite ne facture qu'une fois la commande partie en production.
  const sinaliteCharged = input.status === 'SUBMITTED' || input.status === 'IN_PRODUCTION';
  if (!input.chargeCancelFee || !sinaliteCharged) return 0;

  const raw = input.perJobFeeCents ?? Number(process.env.ORDER_CANCEL_FEE_CENTS ?? 2500);
  const perJob = Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 2500;

  // Plafonné à la part carte — jamais de refund négatif, jamais de ponction crédit.
  return Math.min(Math.max(0, input.amountCents), perJob * Math.max(1, input.itemsCount));
}
