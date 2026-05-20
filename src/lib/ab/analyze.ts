/**
 * A/B test analysis — pure functions pour computer lift + signaux de
 * confiance. Pas de stats académiques (chi-square, p-value) pour MVP —
 * on donne juste le lift relatif + un signal "assez de data" ou pas.
 *
 * Round 20 #1.
 */

export interface VariantSummary {
  variantId: string;
  /** Nombre d'assignments (visiteurs ayant vu ce variant). */
  assignments: number;
  /** Nombre de conversions pour le goal principal. */
  conversions: number;
  /** Conversion rate en décimal (0.05 = 5 %). */
  rate: number;
  /** Identifie si c'est le variant de contrôle (id === 'control'). */
  isControl: boolean;
}

export interface VariantWithLift extends VariantSummary {
  /** Lift relatif au control en %. Négatif = pire que control. NULL si
   *  control lui-même OU si control a 0 assignments (lift undefined). */
  liftPct: number | null;
  /** "winning" si liftPct > 0 ET sample size suffisant. Pour highlight UI. */
  isWinning: boolean;
}

/**
 * Sample size minimum par variant avant de croire le lift. 100 assignments
 * = ordre de magnitude raisonnable pour détecter du 10 %+ de lift. En
 * dessous, le bruit statistique domine.
 */
export const MIN_SAMPLE_SIZE = 100;

/**
 * Calcule le lift et flag winning pour chaque variant vs control.
 *
 * @returns Array de VariantWithLift, control en premier puis triés par rate desc.
 */
export function analyzeVariants(variants: VariantSummary[]): VariantWithLift[] {
  const control = variants.find((v) => v.isControl);
  if (!control || control.assignments === 0) {
    // Pas de control ou control vide → lift undefined pour tout le monde
    return variants.map((v) => ({ ...v, liftPct: null, isWinning: false }));
  }
  const controlRate = control.rate;

  const withLift = variants.map<VariantWithLift>((v) => {
    if (v.isControl) {
      return { ...v, liftPct: null, isWinning: false };
    }
    const liftPct = controlRate > 0
      ? ((v.rate - controlRate) / controlRate) * 100
      : null;
    const isWinning = liftPct !== null
      && liftPct > 0
      && v.assignments >= MIN_SAMPLE_SIZE
      && control.assignments >= MIN_SAMPLE_SIZE;
    return { ...v, liftPct, isWinning };
  });

  // Sort : control first, then by rate desc
  return withLift.sort((a, b) => {
    if (a.isControl) return -1;
    if (b.isControl) return 1;
    return b.rate - a.rate;
  });
}

/**
 * Verdict global sur une experiment : assez de data ? Y a-t-il un winner ?
 */
export interface ExperimentVerdict {
  /** Total assignments toutes variants confondues. */
  totalAssignments: number;
  /** True si toutes les variants ont >= MIN_SAMPLE_SIZE. */
  hasEnoughData: boolean;
  /** Variant winning (lift > 0 + assez de data) — si plusieurs, le top. */
  winnerVariantId: string | null;
  /** Lift du winner. */
  winnerLiftPct: number | null;
  /** Message human-readable pour l'admin. */
  message: string;
}

export function verdictForExperiment(variants: VariantSummary[]): ExperimentVerdict {
  const analyzed = analyzeVariants(variants);
  const totalAssignments = variants.reduce((sum, v) => sum + v.assignments, 0);
  const hasEnoughData = variants.every((v) => v.assignments >= MIN_SAMPLE_SIZE);
  const winners = analyzed.filter((v) => v.isWinning);
  const winner = winners.length > 0
    ? winners.reduce((best, v) => (v.liftPct! > (best.liftPct ?? -Infinity) ? v : best))
    : null;

  let message: string;
  if (totalAssignments === 0) {
    message = 'Pas encore de data — attends quelques traffic.';
  } else if (!hasEnoughData) {
    const needed = variants.map((v) => Math.max(0, MIN_SAMPLE_SIZE - v.assignments));
    const total = needed.reduce((a, b) => a + b, 0);
    message = `Encore ${total} assignments needed pour conclure (≥ ${MIN_SAMPLE_SIZE}/variant).`;
  } else if (winner) {
    message = `🏆 Winner : ${winner.variantId} (+${winner.liftPct!.toFixed(1)} % lift).`;
  } else {
    message = 'Data suffisante, aucun variant ne bat le control significativement.';
  }

  return {
    totalAssignments,
    hasEnoughData,
    winnerVariantId: winner?.variantId ?? null,
    winnerLiftPct: winner?.liftPct ?? null,
    message,
  };
}
