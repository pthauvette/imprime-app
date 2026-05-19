/**
 * Prisma extension qui log les queries lentes.
 *
 * Threshold via SLOW_QUERY_THRESHOLD_MS env (default 200ms). Chaque query
 * qui dépasse → log.warn avec model + action + ms. Queries > 1s → Sentry
 * breadcrumb (sans bloquer, juste pour avoir le contexte au prochain
 * crash).
 *
 * Pattern $extends est le replacement officiel de $use (déprécié Prisma
 * 6+). On retourne le client wrappé qui doit être utilisé partout au
 * lieu du brut.
 *
 * Pourquoi log juste les lentes : à 200ms threshold on capture les vraies
 * dégradations (N+1, missing index, table scan) sans noyer les logs avec
 * les SELECT * basiques.
 */

import type { PrismaClient } from '@prisma/client';
import { log } from '@/lib/logger';

const DEFAULT_THRESHOLD_MS = 200;
const SENTRY_THRESHOLD_MS = 1000;

const THRESHOLD = Number(process.env.SLOW_QUERY_THRESHOLD_MS) || DEFAULT_THRESHOLD_MS;

interface QueryStats {
  /** Total queries observées (depuis le démarrage du process). */
  total: number;
  /** Slow queries (> threshold). */
  slow: number;
  /** Très lentes (> 1s). */
  verySlow: number;
}

const stats: QueryStats = { total: 0, slow: 0, verySlow: 0 };

/**
 * Wrap un PrismaClient avec un middleware qui time chaque opération.
 * Re-exporte le même type (intersection avec $extends preserve API).
 */
export function withSlowQueryLog<T extends PrismaClient>(client: T): T {
  return client.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const start = Date.now();
        try {
          const result = await query(args);
          recordTiming({ model, operation, ms: Date.now() - start });
          return result;
        } catch (err) {
          // Même si la query fail, on time pour repérer les timeouts
          recordTiming({ model, operation, ms: Date.now() - start, error: true });
          throw err;
        }
      },
    },
  }) as unknown as T;
}

function recordTiming(input: {
  model: string | undefined;
  operation: string;
  ms: number;
  error?: boolean;
}): void {
  stats.total += 1;
  if (input.ms < THRESHOLD) return;

  stats.slow += 1;
  if (input.ms >= SENTRY_THRESHOLD_MS) stats.verySlow += 1;

  log.warn(
    {
      component: 'prisma',
      model: input.model ?? '(raw)',
      operation: input.operation,
      durationMs: input.ms,
      threshold: THRESHOLD,
      error: input.error ?? false,
    },
    `slow query: ${input.model ?? 'raw'}.${input.operation} took ${input.ms}ms`,
  );

  // Optional Sentry breadcrumb pour les très lentes — utile au debug
  // quand un crash arrive juste après une query monstre. Best-effort.
  if (input.ms >= SENTRY_THRESHOLD_MS) {
    try {
      // Lazy import pour pas wire Sentry partout — si module pas chargé
      // (instrumentation pas init), on no-op.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/nextjs') as typeof import('@sentry/nextjs');
      Sentry.addBreadcrumb({
        category: 'db',
        level: 'warning',
        message: `Slow query: ${input.model ?? 'raw'}.${input.operation}`,
        data: { durationMs: input.ms, error: input.error ?? false },
      });
    } catch {
      // Sentry pas dispo → skip
    }
  }
}

/** Stats process-level pour /admin/perf future ou debug. */
export function getSlowQueryStats(): Readonly<QueryStats> {
  return { ...stats };
}

export const SLOW_QUERY_THRESHOLD_MS = THRESHOLD;
