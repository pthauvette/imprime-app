/**
 * GET /api/cron/cleanup
 *
 * Cleanup quotidien des rows expirées :
 *   - Draft  (wizard order in-progress) : delete WHERE expiresAt < now()
 *   - DesignDraft (design pdfme) : delete WHERE orderId IS NULL ET
 *     updatedAt < (now - 30j). On garde TOUS les designs liés à une order
 *     pour audit/réimpression.
 *
 * Auth : header `Authorization: Bearer ${CRON_SECRET}` (env var).
 * Sans secret configuré, l'endpoint refuse tout sauf en dev (NODE_ENV).
 *
 * Schedule : UptimeRobot HTTP monitor "keyword" config sur cette URL avec
 * le header Authorization custom, intervalle 24h. Alternative : AWS
 * EventBridge → API Gateway → cette route.
 *
 * Retourne JSON avec compte de rows supprimées par modèle + latencyMs.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun, cleanupOldCronRuns } from '@/lib/cron/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DESIGN_DRAFT_TTL_DAYS = 30;

export async function GET(req: NextRequest) {
  // Auth — refuse si pas configuré (prod) ou si header manque/mismatch
  const denied = requireCronAuth(req, 'cleanup');
  if (denied) return denied;

  const start = Date.now();
  const now = new Date();
  const designCutoff = new Date(now.getTime() - DESIGN_DRAFT_TTL_DAYS * 24 * 3600 * 1000);

  try {
    const [drafts, designs, oldCronRuns] = await Promise.all([
      prisma.draft.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.designDraft.deleteMany({
        where: {
          orderId: null,
          updatedAt: { lt: designCutoff },
        },
      }),
      // Aussi : cleanup les rows CronRun > 30 jours pour pas que la table
      // grossisse à l'infini (~120 rows/jour × 30 = 3600 max).
      cleanupOldCronRuns(30).catch(() => 0),
    ]);

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      deleted: {
        drafts: drafts.count,
        designDrafts: designs.count,
        oldCronRuns,
      },
      cutoffs: {
        drafts: 'expiresAt < now',
        designDrafts: `updatedAt < now - ${DESIGN_DRAFT_TTL_DAYS}d AND orderId is null`,
        cronRuns: 'createdAt < now - 30d',
      },
    };

    log.info(result, 'cron/cleanup ran');
    await pingCronHealthcheck('cleanup', 'success');
    await recordCronRun({
      name: 'cleanup',
      status: 'success',
      latencyMs: Date.now() - start,
      data: result.deleted,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/cleanup failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    await pingCronHealthcheck('cleanup', 'fail', { error: errMsg });
    await recordCronRun({
      name: 'cleanup',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
    });
    return NextResponse.json(
      {
        ok: false,
        error: errMsg,
        latencyMs: Date.now() - start,
      },
      { status: 500 },
    );
  }
}
