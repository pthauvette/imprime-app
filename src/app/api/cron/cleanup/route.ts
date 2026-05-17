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
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const DESIGN_DRAFT_TTL_DAYS = 30;

export async function GET(req: NextRequest) {
  // Auth — refuse si pas configuré (prod) ou si header manque/mismatch
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      log.error('cron/cleanup: CRON_SECRET not set in production — refusing');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    // Dev mode : log a warning but allow
    log.warn('cron/cleanup: CRON_SECRET not set — allowing in non-prod');
  } else {
    const auth = req.headers.get('authorization') ?? '';
    const expected = `Bearer ${CRON_SECRET}`;
    if (auth !== expected) {
      // Generic 401, no info leak
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();
  const now = new Date();
  const designCutoff = new Date(now.getTime() - DESIGN_DRAFT_TTL_DAYS * 24 * 3600 * 1000);

  try {
    const [drafts, designs] = await Promise.all([
      prisma.draft.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.designDraft.deleteMany({
        where: {
          orderId: null,
          updatedAt: { lt: designCutoff },
        },
      }),
    ]);

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      deleted: {
        drafts: drafts.count,
        designDrafts: designs.count,
      },
      cutoffs: {
        drafts: 'expiresAt < now',
        designDrafts: `updatedAt < now - ${DESIGN_DRAFT_TTL_DAYS}d AND orderId is null`,
      },
    };

    log.info(result, 'cron/cleanup ran');
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/cleanup failed');
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Internal error',
        latencyMs: Date.now() - start,
      },
      { status: 500 },
    );
  }
}
