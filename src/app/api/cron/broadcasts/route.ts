/**
 * GET /api/cron/broadcasts
 *
 * Round 19 #4 — processe les broadcasts SCHEDULED dont scheduledAt < now.
 * Marque chacun comme PROCESSING d'abord (claim atomique) pour idempotence
 * sous overlap cron runs.
 *
 * Schedule : every 5 minutes (cf .github/workflows/cron-broadcasts.yml).
 * Précision suffisante — l'admin ne mesure pas à la seconde.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { dispatchBroadcast } from '@/lib/broadcast/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 10; // max broadcasts par run (chacun peut être 10k emails)

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      log.error('cron/broadcasts: CRON_SECRET not set in production');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    log.warn('cron/broadcasts: CRON_SECRET not set — allowing in non-prod');
  } else {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();

  try {
    // Claim atomique pour idempotence : SCHEDULED → PROCESSING dans une
    // updateMany WHERE scheduledAt < now, puis findMany sur le claim.
    const now = new Date();
    const claim = await prisma.emailBroadcast.updateMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
      },
      data: { status: 'PROCESSING' },
    });

    if (claim.count === 0) {
      const result = { ok: true, latencyMs: Date.now() - start, processed: 0 };
      void pingCronHealthcheck('broadcasts', 'success', { processed: 0 });
      void recordCronRun({ name: 'broadcasts', status: 'success', latencyMs: Date.now() - start, data: { processed: 0 } });
      return NextResponse.json(result);
    }

    // Re-fetch les rows claimées (max BATCH_SIZE pour ce run)
    const ready = await prisma.emailBroadcast.findMany({
      where: { status: 'PROCESSING' },
      orderBy: { scheduledAt: 'asc' },
      take: BATCH_SIZE,
    });

    let processed = 0;
    let totalEnqueued = 0;
    for (const b of ready) {
      try {
        const { enqueued } = await dispatchBroadcast({
          id: b.id,
          subject: b.subject,
          body: b.body,
          segment: b.segment,
          adminEmail: b.adminEmail,
        });
        totalEnqueued += enqueued;
        processed++;
      } catch (err) {
        log.error({ err, broadcastId: b.id }, 'cron/broadcasts dispatch failed');
        // Le broadcast reste en PROCESSING — admin verra et investiguera.
        // On ne le re-claim pas auto (évite la boucle de fail).
      }
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      processed,
      totalEnqueued,
      claimed: claim.count,
    };
    log.info(result, 'cron/broadcasts ran');
    void pingCronHealthcheck('broadcasts', 'success', { processed, totalEnqueued });
    void recordCronRun({
      name: 'broadcasts',
      status: 'success',
      latencyMs: Date.now() - start,
      data: { processed, totalEnqueued, claimed: claim.count },
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/broadcasts failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('broadcasts', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'broadcasts',
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
