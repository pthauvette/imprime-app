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

/**
 * Combien le user doit dépenser de plus pour atteindre le tier supérieur.
 * Retourne null si déjà au top tier (GOLD).
 */
export function nextTierProgress(input: LoyaltyTierInput): {
  current: LoyaltyTier;
  next: LoyaltyTier | null;
  needsCents: number | null;
  progressPct: number;
} {
  const current = computeLoyaltyTier(input);
  if (current === 'GOLD') {
    return { current, next: null, needsCents: null, progressPct: 100 };
  }
  if (current === 'SILVER') {
    return {
      current,
      next: 'GOLD',
      needsCents: GOLD_THRESHOLD_CENTS - input.revenueLast365dCents,
      progressPct: Math.min(
        100,
        Math.round(
          ((input.revenueLast365dCents - SILVER_THRESHOLD_CENTS) /
            (GOLD_THRESHOLD_CENTS - SILVER_THRESHOLD_CENTS)) *
            100,
        ),
      ),
    };
  }
  // BRONZE
  return {
    current,
    next: 'SILVER',
    needsCents: SILVER_THRESHOLD_CENTS - input.revenueLast365dCents,
    progressPct: Math.min(
      100,
      Math.round((input.revenueLast365dCents / SILVER_THRESHOLD_CENTS) * 100),
    ),
  };
}

export const TIER_LABELS: Record<LoyaltyTier, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Argent',
  GOLD: 'Or',
};

export const TIER_PERKS: Record<LoyaltyTier, string[]> = {
  BRONZE: ['Accès aux promos saisonnières'],
  SILVER: [
    'Tout ce que BRONZE a',
    '5 % de remise auto sur les commandes > 100 $',
    'Service support prioritaire (réponse < 1 h ouvrable)',
  ],
  GOLD: [
    'Tout ce que SILVER a',
    'Livraison standard gratuite, peu importe le montant',
    'Accès aux nouveaux produits en avant-première',
    'Production prioritaire (passe en tête de file)',
  ],
};
