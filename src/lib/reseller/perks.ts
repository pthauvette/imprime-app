/**
 * Reseller perks — pure functions, testables sans DB.
 *
 * Round 22 #2. Une seule perk pour MVP : 5% discount auto si VERIFIED.
 * Si Round 23+ veut stack d'autres perks (free shipping reseller, priorité
 * production), ajouter ici comme fonctions séparées qui composent.
 *
 * Important : AUTO_DETECTED ne donne PAS de perks. Seul VERIFIED.
 *   - AUTO_DETECTED = "tu pourrais être reseller" (signal pour admin)
 *   - VERIFIED = "tu ES reseller (admin a validé) — perks débloquées"
 */

export type ResellerStatus = 'NONE' | 'AUTO_DETECTED' | 'VERIFIED';

/** Pourcentage de discount appliqué aux resellers vérifiés. */
export const RESELLER_DISCOUNT_PCT = 5;

/**
 * Calcule le discount reseller en cents pour un subtotal donné.
 *
 * @param subtotalCents - Sous-total avant shipping/tax (cents)
 * @param status - Le resellerStatus du user
 * @returns Discount en cents (0 si pas VERIFIED). Round DOWN — on favorise
 *   Plio, pas le user (même rationale que loyalty bonus).
 */
export function computeResellerDiscount(subtotalCents: number, status: ResellerStatus): number {
  if (status !== 'VERIFIED') return 0;
  if (subtotalCents <= 0) return 0;
  return Math.floor((subtotalCents * RESELLER_DISCOUNT_PCT) / 100);
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
  return {
    amountCents: amount,
    pct: RESELLER_DISCOUNT_PCT,
    label: `Reseller perks (-${RESELLER_DISCOUNT_PCT} %)`,
  };
}
