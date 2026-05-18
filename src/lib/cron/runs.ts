/**
 * Persist les runs des cron jobs en DB pour /admin/crons.
 *
 * Best-effort : si l'insert fail, on log warn mais on continue — le
 * cron est plus important que le tracking.
 *
 * Pattern d'usage dans une route cron :
 *
 *   const start = Date.now();
 *   try {
 *     // ... cron logic ...
 *     await recordCronRun({
 *       name: 'cleanup',
 *       status: 'success',
 *       latencyMs: Date.now() - start,
 *       data: { rowsCleaned: 42 },
 *     });
 *   } catch (err) {
 *     await recordCronRun({
 *       name: 'cleanup',
 *       status: 'fail',
 *       latencyMs: Date.now() - start,
 *       errorMessage: err instanceof Error ? err.message : 'unknown',
 *     });
 *     throw err;
 *   }
 */

import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';

export interface RecordCronRunInput {
  name: string;
  status: 'success' | 'fail';
  latencyMs: number;
  errorMessage?: string;
  data?: Record<string, unknown>;
}

/** Insère une row CronRun. Best-effort — ne throw jamais. */
export async function recordCronRun(input: RecordCronRunInput): Promise<void> {
  try {
    await prisma.cronRun.create({
      data: {
        name: input.name,
        status: input.status,
        latencyMs: Math.max(0, Math.round(input.latencyMs)),
        errorMessage: input.errorMessage?.slice(0, 500) ?? null,
        data: input.data ? JSON.stringify(input.data).slice(0, 10_000) : null,
      },
    });
  } catch (err) {
    log.warn({ err, cron: input.name }, 'recordCronRun failed (cron itself was OK)');
  }
}

/** Cleanup : delete les rows CronRun > N jours. Appelé par cron/cleanup. */
export async function cleanupOldCronRuns(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000);
  const result = await prisma.cronRun.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
