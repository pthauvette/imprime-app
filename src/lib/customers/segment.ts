/**
 * Customer segmentation : classify un user en bucket business actionable.
 *
 * Conventions :
 *   - NEW     : registered mais 0 commande payée
 *   - ACTIVE  : commande dans les 90 derniers jours
 *   - VIP     : LTV > 1000 $ OU 5+ orders dans les 365 derniers jours
 *               (priorité sur ACTIVE/AT_RISK pour le badge)
 *   - AT_RISK : dernière commande 90-180 jours — recovery candidate
 *   - LOST    : > 180 jours — winback candidate, le re-engagement cron
 *               s'en occupe via PromoCode REVIENS<>
 *
 * Pure function — testable + réutilisable côté admin user page,
 * dashboard, segments broadcast, etc.
 */

export type CustomerSegment = 'NEW' | 'ACTIVE' | 'VIP' | 'AT_RISK' | 'LOST';

const VIP_LTV_CENTS = 100_000; // 1000 $
const VIP_ORDERS_365D = 5;
const ACTIVE_DAYS = 90;
const AT_RISK_DAYS = 180;

export interface CustomerStats {
  /** Total $ over user lifetime (in cents, post-refund). */
  ltvCents: number;
  /** Nb commandes (toutes statuses confondus). */
  orderCount: number;
  /** Nb commandes dans les 365 derniers jours. */
  ordersLast365d?: number;
  /** Date de la dernière commande. NULL si aucune. */
  lastOrderDate?: Date | null;
  /** Date de la 1ère commande (acquisition). NULL si aucune. */
  firstOrderDate?: Date | null;
}

export interface SegmentResult {
  segment: CustomerSegment;
  /** Label friendly français pour l'admin UI. */
  label: string;
  /** Tone color CSS variable name pour le badge. */
  tone: 'success' | 'accent' | 'warning' | 'danger' | 'muted';
  /** Description courte pour tooltip / aide admin. */
  reason: string;
}

export function classifyCustomer(stats: CustomerStats): SegmentResult {
  // NEW : pas de commande encore
  if (stats.orderCount === 0 || !stats.lastOrderDate) {
    return {
      segment: 'NEW',
      label: 'Nouveau',
      tone: 'muted',
      reason: 'Inscrit mais aucune commande payée encore',
    };
  }

  // VIP override : top tier d'abord, peu importe la récence
  const ordersLast365d = stats.ordersLast365d ?? 0;
  if (stats.ltvCents >= VIP_LTV_CENTS || ordersLast365d >= VIP_ORDERS_365D) {
    const reason =
      stats.ltvCents >= VIP_LTV_CENTS
        ? `LTV ${(stats.ltvCents / 100).toFixed(0)} $ > 1 000 $`
        : `${ordersLast365d} commandes sur 365 j`;
    return { segment: 'VIP', label: 'VIP', tone: 'accent', reason };
  }

  const daysSinceLast = daysSince(stats.lastOrderDate);

  if (daysSinceLast <= ACTIVE_DAYS) {
    return {
      segment: 'ACTIVE',
      label: 'Actif',
      tone: 'success',
      reason: `Commande il y a ${daysSinceLast} jour${daysSinceLast > 1 ? 's' : ''}`,
    };
  }

  if (daysSinceLast <= AT_RISK_DAYS) {
    return {
      segment: 'AT_RISK',
      label: 'À risque',
      tone: 'warning',
      reason: `${daysSinceLast} jours sans commande (90-180 = recovery)`,
    };
  }

  return {
    segment: 'LOST',
    label: 'Perdu',
    tone: 'danger',
    reason: `${daysSinceLast} jours sans commande — winback cron envoie REVIENS<>`,
  };
}

/** Jours écoulés depuis une date donnée (arrondi inférieur). */
export function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (24 * 3600 * 1000));
}

/**
 * RFM mini-summary pour display admin. Recency days + Frequency / yr +
 * Monetary $.
 */
export function rfmSummary(stats: CustomerStats): {
  recencyDays: number | null;
  frequencyPerYear: number;
  monetaryDollars: number;
} {
  const recencyDays = stats.lastOrderDate ? daysSince(stats.lastOrderDate) : null;
  // Frequency : si on a < 1 an d'historique, on extrapole annuellement
  const tenureDays = stats.firstOrderDate ? daysSince(stats.firstOrderDate) : 0;
  const frequencyPerYear =
    tenureDays > 0 && stats.orderCount > 0
      ? Math.round((stats.orderCount / Math.max(tenureDays, 30)) * 365 * 10) / 10
      : 0;
  return {
    recencyDays,
    frequencyPerYear,
    monetaryDollars: Math.round(stats.ltvCents / 100),
  };
}
