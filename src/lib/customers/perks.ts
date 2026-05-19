/**
 * Loyalty perks — règles appliquées server-side au checkout.
 *
 * Source de vérité : User.loyaltyTier (recomputé mensuellement par
 * /api/cron/loyalty-tiers). Le client ne peut PAS forcer ces perks
 * — l'API /orders/create re-lit user.loyaltyTier depuis la DB.
 *
 * Round 13 #5 : GOLD = livraison gratuite (peu importe le carrier).
 */

import type { LoyaltyTier } from './loyalty';

export interface ShippingPerkInput {
  tier: LoyaltyTier | string | null;
  /** Prix de livraison facturé par le carrier (Sinalite shipping estimate). */
  shippingPrice: number;
}

export interface ShippingPerkResult {
  /** Prix effectif après application des perks (en $). */
  effectiveShippingPrice: number;
  /** True si on a appliqué le perk GOLD free shipping. */
  goldFreeShipping: boolean;
}

export function applyShippingPerks(input: ShippingPerkInput): ShippingPerkResult {
  if (input.tier === 'GOLD' && input.shippingPrice > 0) {
    return { effectiveShippingPrice: 0, goldFreeShipping: true };
  }
  return { effectiveShippingPrice: input.shippingPrice, goldFreeShipping: false };
}
