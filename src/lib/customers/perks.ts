/**
 * Loyalty perks — règles appliquées server-side au checkout.
 *
 * Source de vérité : User.loyaltyTier (recomputé mensuellement par
 * /api/cron/loyalty-tiers). Le client ne peut PAS forcer ces perks
 * — l'API /orders/create re-lit user.loyaltyTier depuis la DB.
 *
 * Round 13 #5 : GOLD = livraison gratuite.
 *
 * Alignement Sinalite (audit 2026-07, F7) : Sinalite facture le transport PLEIN
 * sur les commandes custom (= TOUTES les commandes Plio ; la gratuité Sinalite
 * exclut les custom orders). Une gratuité GOLD INCONDITIONNELLE faisait donc
 * absorber à Plio 100 % d'un UPS express/région éloignée (30-90 $+), récurrent.
 * On PLAFONNE désormais ce que Plio absorbe : gratuit jusqu'au plafond, le surplus
 * est facturé au client. Plafond configurable (env GOLD_FREE_SHIPPING_CAP_CENTS) ;
 * défaut 2500¢ (25 $) — couvre la livraison standard CA, borne l'express/remote.
 * Le mettre très haut (ex. 100000) restaure la gratuité quasi inconditionnelle.
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
  /** True SEULEMENT si la livraison est réellement ramenée à 0 (label « gratuit »). */
  goldFreeShipping: boolean;
}

/** Plafond ($) que Plio absorbe sur la livraison GOLD. Lu à l'appel (testable). */
function goldShippingCapDollars(): number {
  const cents = Number(process.env.GOLD_FREE_SHIPPING_CAP_CENTS ?? 2500);
  return Number.isFinite(cents) && cents >= 0 ? cents / 100 : 25;
}

export function applyShippingPerks(input: ShippingPerkInput): ShippingPerkResult {
  if (input.tier === 'GOLD' && input.shippingPrice > 0) {
    // Plio absorbe jusqu'au plafond ; au-delà, le client paie le surplus.
    const effective = Math.max(0, input.shippingPrice - goldShippingCapDollars());
    return { effectiveShippingPrice: effective, goldFreeShipping: effective === 0 };
  }
  return { effectiveShippingPrice: input.shippingPrice, goldFreeShipping: false };
}
