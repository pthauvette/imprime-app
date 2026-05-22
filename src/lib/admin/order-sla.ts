/**
 * Round 25 #3 — Order SLA metrics.
 *
 * Calcule deux durées critiques pour mesurer la santé ops Plio :
 *   - time-to-submit : paidAt → SINALITE_SUBMITTED event (nous → Sinalite)
 *   - time-to-ship   : SINALITE_SUBMITTED → SHIPPED status (Sinalite → carrier)
 *
 * Fenêtre : 30 derniers jours. Sur chaque list de durées on prend P50 + P95
 * (P95 = "le pire 5 %", c'est la metric que tu veux watcher pour les SLO).
 *
 * Pourquoi P50/P95 vs moyenne :
 *   - moyenne est polluée par les outliers (1 order qui prend 7j fausse tout)
 *   - P50 = expérience customer typique
 *   - P95 = pire cas raisonnable (les 5 % les plus lents)
 *
 * Architecture :
 *   On fetch les Orders qui ont eu un de ces 2 transitions dans la fenêtre,
 *   avec leurs events. Ensuite walk in-memory → cheap, predictable.
 *   Cap à 500 orders/fenêtre pour pas exploser au scale.
 */

import { prisma } from '@/lib/db';

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SAMPLE = 500;

export interface SlaBucket {
  /** Combien d'orders ont été inclus dans le calcul. */
  sampleSize: number;
  /** Médian en heures. null si sample vide. */
  p50Hours: number | null;
  /** 95e percentile en heures. null si sample vide. */
  p95Hours: number | null;
}

export interface OrderSlaMetrics {
  windowDays: number;
  computedAt: Date;
  timeToSubmit: SlaBucket;
  timeToShip: SlaBucket;
}

/**
 * Quantile d'une liste de nombres (ne mute pas l'input).
 * Méthode "nearest-rank" — simple et stable pour des samples > 20.
 */
export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  if (q < 0 || q > 1) throw new Error(`quantile q out of range: ${q}`);
  const sorted = [...values].sort((a, b) => a - b);
  // nearest-rank : index = ceil(q * N) - 1, clamped à [0, N-1]
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1));
  return sorted[idx]!;
}

function msToHours(ms: number): number {
  return Math.round((ms / (1000 * 60 * 60)) * 10) / 10; // 1 décimale
}

function bucketFromDurationsMs(durationsMs: number[]): SlaBucket {
  if (durationsMs.length === 0) {
    return { sampleSize: 0, p50Hours: null, p95Hours: null };
  }
  return {
    sampleSize: durationsMs.length,
    p50Hours: msToHours(quantile(durationsMs, 0.5)!),
    p95Hours: msToHours(quantile(durationsMs, 0.95)!),
  };
}

/**
 * Pour un Order avec ses events, retourne les 2 durations si calculables.
 * Exporté pour tests unitaires (sans round-trip DB).
 */
export function computeOrderDurations(
  paidAt: Date | null,
  events: Array<{ kind: string; data: string | null; createdAt: Date }>,
): { submitMs: number | null; shipMs: number | null } {
  if (!paidAt) return { submitMs: null, shipMs: null };

  const firstSubmitted = events.find((e) => e.kind === 'SINALITE_SUBMITTED');
  const submitMs = firstSubmitted && firstSubmitted.createdAt >= paidAt
    ? firstSubmitted.createdAt.getTime() - paidAt.getTime()
    : null;

  if (!firstSubmitted) return { submitMs, shipMs: null };

  // First STATUS_CHANGED event with SHIPPED dans le payload data.
  // data est un JSON stringifié — on cherche "SHIPPED" en substring,
  // pas besoin de parser pour ça (et c'est resilient si la shape change).
  const firstShipped = events.find(
    (e) => e.kind === 'SINALITE_STATUS_CHANGED'
      && (e.data?.includes('SHIPPED') ?? false)
      && e.createdAt >= firstSubmitted.createdAt,
  );

  const shipMs = firstShipped
    ? firstShipped.createdAt.getTime() - firstSubmitted.createdAt.getTime()
    : null;

  return { submitMs, shipMs };
}

export async function computeOrderSlaMetrics(): Promise<OrderSlaMetrics> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_MS);

  // Orders qui ont eu un SUBMITTED ou un SHIPPED event dans la fenêtre.
  // OR dans Prisma where → traduit en SQL OR, l'index sur (orderId, createdAt)
  // de OrderEvent + l'index implicite sur Order.id donnent un plan correct.
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { events: { some: { kind: 'SINALITE_SUBMITTED', createdAt: { gte: cutoff } } } },
        {
          events: {
            some: {
              kind: 'SINALITE_STATUS_CHANGED',
              createdAt: { gte: cutoff },
              data: { contains: 'SHIPPED' },
            },
          },
        },
      ],
    },
    select: {
      paidAt: true,
      events: {
        orderBy: { createdAt: 'asc' },
        select: { kind: true, data: true, createdAt: true },
      },
    },
    take: MAX_SAMPLE,
    orderBy: { createdAt: 'desc' },
  });

  const submitDurations: number[] = [];
  const shipDurations: number[] = [];

  for (const o of orders) {
    const { submitMs, shipMs } = computeOrderDurations(o.paidAt, o.events);
    if (submitMs !== null) submitDurations.push(submitMs);
    if (shipMs !== null) shipDurations.push(shipMs);
  }

  return {
    windowDays: 30,
    computedAt: now,
    timeToSubmit: bucketFromDurationsMs(submitDurations),
    timeToShip: bucketFromDurationsMs(shipDurations),
  };
}
