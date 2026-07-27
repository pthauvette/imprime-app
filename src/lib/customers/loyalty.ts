/**
 * Loyalty tier program — basé sur le revenu net 365 derniers jours.
 *
 * Thresholds (en cents CAD) :
 *   - BRONZE : default (tout le monde commence ici)
 *   - SILVER : ≥ 500 $ / 365 j
 *   - GOLD   : ≥ 2000 $ / 365 j
 *
 * Recomputé mensuellement via /api/cron/loyalty-tiers — pas en temps
 * réel à chaque order (overkill et race conditions).
 *
 * Pure function — easy to test + reuse pour preview admin "ce que serait
 * ton tier si on recompute now".
 */

export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD';

export const SILVER_THRESHOLD_CENTS = 500_00; // $500
export const GOLD_THRESHOLD_CENTS = 2000_00; // $2000

export interface LoyaltyTierInput {
  /** Revenu net 365 derniers jours, en cents (excl. refunds + cancelled). */
  revenueLast365dCents: number;
}

export function computeLoyaltyTier(input: LoyaltyTierInput): LoyaltyTier {
  if (input.revenueLast365dCents >= GOLD_THRESHOLD_CENTS) return 'GOLD';
  if (input.revenueLast365dCents >= SILVER_THRESHOLD_CENTS) return 'SILVER';
  return 'BRONZE';
}

export interface NextTierProgressInput extends LoyaltyTierInput {
  /**
   * finding [56] — tier ACTUEL autoritaire (`User.loyaltyTier`, recomputé
   * mensuellement par le cron — cf. perks.ts « source de vérité »).
   * `revenueLast365dCents` est en temps réel et peut donc déjà dépasser ce
   * tier (ou être retombé dessous) : on affiche quand même la progression
   * à partir de ce tier confirmé, JAMAIS un tier recalculé en direct qui
   * contredirait le badge affiché ailleurs sur la même page (avant ce fix,
   * `LoyaltyCard` (tier DB) et `LoyaltyTierProgress` (tier recalculé ici)
   * pouvaient afficher deux paliers différents).
   */
  currentTier: LoyaltyTier;
}

/**
 * Combien le user doit dépenser de plus pour atteindre le tier supérieur.
 * Retourne null si déjà au top tier (GOLD).
 */
export function nextTierProgress(input: NextTierProgressInput): {
  current: LoyaltyTier;
  next: LoyaltyTier | null;
  needsCents: number | null;
  progressPct: number;
} {
  const current = input.currentTier;
  if (current === 'GOLD') {
    return { current, next: null, needsCents: null, progressPct: 100 };
  }
  if (current === 'SILVER') {
    return {
      current,
      next: 'GOLD',
      // Math.max(0, …) — le revenu live peut être sous OU au-dessus du seuil
      // du tier confirmé (tier pas encore recalculé par le cron mensuel) ;
      // on ne veut jamais un "besoin" négatif ou un % hors [0, 100].
      needsCents: Math.max(0, GOLD_THRESHOLD_CENTS - input.revenueLast365dCents),
      progressPct: Math.max(0, Math.min(
        100,
        Math.round(
          ((input.revenueLast365dCents - SILVER_THRESHOLD_CENTS) /
            (GOLD_THRESHOLD_CENTS - SILVER_THRESHOLD_CENTS)) *
            100,
        ),
      )),
    };
  }
  // BRONZE
  return {
    current,
    next: 'SILVER',
    needsCents: Math.max(0, SILVER_THRESHOLD_CENTS - input.revenueLast365dCents),
    progressPct: Math.max(0, Math.min(
      100,
      Math.round((input.revenueLast365dCents / SILVER_THRESHOLD_CENTS) * 100),
    )),
  };
}

export const TIER_LABELS: Record<LoyaltyTier, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Argent',
  GOLD: 'Or',
};

// finding [55] — 2 promesses ici ne correspondaient à AUCUNE logique de prix
// réelle (risque LPC, représentation trompeuse) : le « 5 % de remise auto »
// SILVER n'existe nulle part dans price-order.ts (seul GOLD a un perk de
// livraison, cf. applyShippingPerks dans perks.ts), et le « peu importe le
// montant » GOLD est en fait plafonné (GOLD_FREE_SHIPPING_CAP_CENTS, 25 $ par
// défaut — le surplus est facturé). Retiré/corrigé plutôt qu'inventé une
// remise qui n'existe pas.
export const TIER_PERKS: Record<LoyaltyTier, string[]> = {
  BRONZE: ['Accès aux promos saisonnières'],
  SILVER: [
    'Tout ce que BRONZE a',
    'Service support prioritaire (réponse < 1 h ouvrable)',
  ],
  GOLD: [
    'Tout ce que SILVER a',
    'Livraison standard gratuite, avec un plafond pour les envois exceptionnels (grand format, régions éloignées)',
    'Accès aux nouveaux produits en avant-première',
    'Production prioritaire (passe en tête de file)',
  ],
};
