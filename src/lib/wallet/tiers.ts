/**
 * Wallet top-up bonus tiers — pure functions, testables sans DB.
 *
 * Le principe : plus le user prépaye gros, plus le bonus % est élevé.
 * Effet : les power-users (resellers, agences) ont une incentive à
 * concentrer leur cash flow sur Plio = retention + cashflow upfront
 * pour nous.
 *
 * Round 18 #1 — initial tiers proposed. Tu peux les ajuster selon ta
 * marge réelle et le breakeven du discount.
 */

export interface WalletTier {
  /** Montant minimum du top-up en cents pour atteindre ce tier. */
  minAmountCents: number;
  /** Bonus en % du montant (ex: 5 = +5 % de credit gratuit). */
  bonusPct: number;
  /** Label affiché dans l'UI. */
  label: string;
}

export const WALLET_TIERS: WalletTier[] = [
  { minAmountCents: 50000,   bonusPct: 5,  label: '500 $ +5 %' },   // $500 → +25 bonus = $525 total
  { minAmountCents: 100000,  bonusPct: 8,  label: '1 000 $ +8 %' }, // $1000 → +80 bonus = $1080 total
  { minAmountCents: 250000,  bonusPct: 12, label: '2 500 $ +12 %' }, // $2500 → +300 bonus = $2800 total
];

/**
 * Trouve le tier applicable pour un montant donné.
 * Returns null si montant < tier min (pas de bonus, mais top-up autorisé).
 *
 * Edge case : si un user top-up exactement minAmountCents du tier 1
 * il reçoit le bonus de ce tier. Si > minAmountCents du tier 2, tier 2.
 */
export function tierForAmount(amountCents: number): WalletTier | null {
  // Iterate from highest to lowest — first match wins.
  for (let i = WALLET_TIERS.length - 1; i >= 0; i--) {
    const tier = WALLET_TIERS[i]!;
    if (amountCents >= tier.minAmountCents) return tier;
  }
  return null;
}

/**
 * Calcule le bonus en cents pour un montant top-up donné.
 */
export function computeBonus(amountCents: number): number {
  const tier = tierForAmount(amountCents);
  if (!tier) return 0;
  return Math.floor((amountCents * tier.bonusPct) / 100);
}

/**
 * Validate qu'un montant de top-up est dans les bornes raisonnables.
 *   - min 10 $ (pas de spam micro-topup)
 *   - max 10 000 $ (anti-fraud, KYC threshold)
 */
export const MIN_TOPUP_CENTS = 1000; // 10 $
export const MAX_TOPUP_CENTS = 1000000; // 10 000 $

export function isValidTopupAmount(amountCents: number): boolean {
  return (
    Number.isInteger(amountCents) &&
    amountCents >= MIN_TOPUP_CENTS &&
    amountCents <= MAX_TOPUP_CENTS
  );
}
