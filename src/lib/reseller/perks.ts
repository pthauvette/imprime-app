/**
 * Reseller perks — pure functions, testables sans DB.
 *
 * Round 22 #2 : VERIFIED → 5 % discount.
 * Round 33    : PLATINUM → 10 % discount + priority production badge.
 *
 * Tier hierarchy (low → high) :
 *   NONE          → guest / regular customer, no perks
 *   AUTO_DETECTED → power-buyer signal (≥ 5 orders/yr), no perks yet
 *   VERIFIED      → admin confirmed reseller, 5 % off auto
 *   PLATINUM      → high-volume VERIFIED (≥ 20 000 $ /yr), 10 % off + priority
 *
 * Auto-detection ladder (cron reseller-detection, monthly) :
 *   NONE       → AUTO_DETECTED si ≥ 5 orders/365j
 *   VERIFIED   → PLATINUM       si ≥ 20 000 $ revenue/365j
 *   PLATINUM   → VERIFIED       si tombe sous 20 000 $/365j (auto-déclassement)
 *   VERIFIED   ne perd jamais le badge auto (admin manual revoke only)
 *   AUTO_DETECTED → NONE        si tombe sous 5 orders/365j
 */

export type ResellerStatus = 'NONE' | 'AUTO_DETECTED' | 'VERIFIED' | 'PLATINUM';

/** Pourcentage de discount par tier. VERIFIED = 5 %, PLATINUM = 10 %. */
export const RESELLER_DISCOUNT_PCT = 5;
export const PLATINUM_DISCOUNT_PCT = 10;

/** Round 33 — threshold revenue 365j pour basculer VERIFIED → PLATINUM (cents). */
export const PLATINUM_REVENUE_THRESHOLD_CENTS = 20_000 * 100; // 20 000 $

/**
 * Calcule le discount reseller en cents pour un subtotal donné.
 *
 * @param subtotalCents - Sous-total avant shipping/tax (cents)
 * @param status - Le resellerStatus du user
 * @returns Discount en cents (0 si pas VERIFIED ni PLATINUM). Round DOWN —
 *   on favorise Plio, pas le user (même rationale que loyalty bonus).
 */
export function computeResellerDiscount(subtotalCents: number, status: ResellerStatus): number {
  if (subtotalCents <= 0) return 0;
  if (status === 'PLATINUM') {
    return Math.floor((subtotalCents * PLATINUM_DISCOUNT_PCT) / 100);
  }
  if (status === 'VERIFIED') {
    return Math.floor((subtotalCents * RESELLER_DISCOUNT_PCT) / 100);
  }
  return 0;
}

/**
 * Helper UI : retourne un breakdown human-friendly du discount.
 * Returns null si pas de discount à afficher.
 */
export function describeResellerDiscount(subtotalCents: number, status: ResellerStatus): {
  amountCents: number;
  pct: number;
  label: string;
} | null {
  const amount = computeResellerDiscount(subtotalCents, status);
  if (amount <= 0) return null;
  const pct = status === 'PLATINUM' ? PLATINUM_DISCOUNT_PCT : RESELLER_DISCOUNT_PCT;
  const tierLabel = status === 'PLATINUM' ? 'PLATINUM' : 'Reseller';
  return {
    amountCents: amount,
    pct,
    label: `${tierLabel} perks (-${pct} %)`,
  };
}

/**
 * Round 33 — Determine si un user devrait être PLATINUM basé sur son revenue
 * 365 j. Pour le cron auto-detection.
 *
 * Note : ne PAS appeler avec un user NONE/AUTO_DETECTED — on ne crée pas
 * PLATINUM sans passer par VERIFIED. PLATINUM se mérite via VERIFIED + volume.
 */
export function shouldBePlatinum(revenueCents365d: number): boolean {
  return revenueCents365d >= PLATINUM_REVENUE_THRESHOLD_CENTS;
}
