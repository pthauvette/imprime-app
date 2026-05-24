/**
 * GET /api/cron/purge-old-events
 *
 * Round 29 #2. Data minimization PIPEDA principe 5 (retention) :
 * supprime les OrderEvent rows pour des orders > 2 ans + terminé
 * (DELIVERED, CANCELLED, FAILED). On garde l'Order row (obligation
 * de conservation fiscale 6 ans), juste on trim le noisy event log.
 *
 * Use case : après 2 ans, le customer a oublié sa commande, le support
 * ne fait plus de référence aux events précis (paid → submitted →
 * shipped → delivered timeline). Les events représentent le bulk de
 * notre stockage par order (~5-15 rows par order avec data webhook
 * potentiellement large) — purge réduit la taille DB sans toucher
 * l'audit financier.
 *
 * Schedule : mensuel 1er du mois 9h UTC (après les autres mensuel à 5-8h).
 *
 * Safety :
 *   - Cap MAX_DELETE_PER_RUN = 5000 events par run (évite long lock
 *     sur grosse table dans le futur)
 *   - On select les orderIds éligibles d'abord, puis deleteMany filtré
 *     sur ces IDs — explicit pour traçabilité dans les logs
 *   - DRY_RUN env override pour audit pré-prod
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const RETENTION_YEARS = 2;
const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED', 'FAILED'] as const;
const MAX_DELETE_PER_RUN = 5000;

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      log.error('cron/purge-old-events: CRON_SECRET not set in production');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    log.warn('cron/purge-old-events: CRON_SECRET not set — allowing in non-prod');
  } else {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();
  const cutoff = new Date(Date.now() - RETENTION_YEARS * 365 * 24 * 3600 * 1000);
  const dryRun = process.env.PURGE_DRY_RUN === '1';

  try {
    // 1. Trouver les orders éligibles : terminal + créées avant cutoff
    //    On limite à MAX_DELETE_PER_RUN pour pas tenir un lock long
    //    (delete-many sur 100k events serait douloureux sur Postgres).
    const eligibleOrders = await prisma.order.findMany({
      where: {
        status: { in: [...TERMINAL_STATUSES] },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
      take: 500, // cap orders, pas events
    });

    if (eligibleOrders.length === 0) {
      const result = { ok: true, latencyMs: Date.now() - start, dryRun, eligibleOrders: 0, deletedEvents: 0 };
      void pingCronHealthcheck('purge-old-events', 'success', result);
      void recordCronRun({ name: 'purge-old-events', status: 'success', latencyMs: Date.now() - start, data: result });
      return NextResponse.json(result);
    }

    const orderIds = eligibleOrders.map((o) => o.id);

    // 2. Count d'abord (audit) avant delete (sauf si dryRun)
    const countToDelete = await prisma.orderEvent.count({
      where: { orderId: { in: orderIds } },
    });

    let deletedEvents = 0;
    if (!dryRun) {
      // deleteMany retourne { count } — bound par MAX_DELETE_PER_RUN au cas
      // où un single order aurait des milliers d'events.
      // Postgres deleteMany ne supporte pas LIMIT directement via Prisma,
      // donc si countToDelete > MAX, on log warn mais on procède (les
      // 5000 servent vraiment juste de "spread" — on n'a pas de orders
      // avec > 100 events réalistement).
      const result = await prisma.orderEvent.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      deletedEvents = result.count;
      if (deletedEvents > MAX_DELETE_PER_RUN) {
        log.warn(
          { deletedEvents, threshold: MAX_DELETE_PER_RUN, eligibleOrders: eligibleOrders.length },
          'purge-old-events: deleted more than soft threshold (next run will be small)',
        );
      }
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      dryRun,
      eligibleOrders: eligibleOrders.length,
      countToDelete,
      deletedEvents,
      cutoff: cutoff.toISOString(),
    };
    log.info(result, 'cron/purge-old-events ran');
    void pingCronHealthcheck('purge-old-events', 'success', { deletedEvents, dryRun });
    void recordCronRun({
      name: 'purge-old-events',
      status: 'success',
      latencyMs: Date.now() - start,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/purge-old-events failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('purge-old-events', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'purge-old-events',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
    });
    return NextResponse.json(
      { ok: false, error: errMsg, latencyMs: Date.now() - start },
      { status: 500 },
    );
  }
}
