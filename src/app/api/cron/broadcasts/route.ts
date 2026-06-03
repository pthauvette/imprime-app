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
// Audit v2 #7.3 — un broadcast coincé en PROCESSING depuis > ce seuil (run
// crashé ou stranded par l'ancien claim non borné) est ré-éligible. dispatch
// n'enqueue que (rapide) + est idempotent (dédup destinataires), donc re-traiter
// est sûr. EmailBroadcast n'a pas d'updatedAt → on se base sur scheduledAt
// (l'heure prévue, forcément passée pour un PROCESSING legit).
const STUCK_PROCESSING_MIN = 15;

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
    const now = new Date();

    // Reaper (Audit v2 #7.3) : ré-arme les broadcasts coincés en PROCESSING
    // (run crashé OU surplus stranded par l'ancien claim non borné) → SCHEDULED.
    const stuckCutoff = new Date(now.getTime() - STUCK_PROCESSING_MIN * 60_000);
    const reaped = await prisma.emailBroadcast.updateMany({
      where: { status: 'PROCESSING', scheduledAt: { lt: stuckCutoff } },
      data: { status: 'SCHEDULED' },
    });
    if (reaped.count > 0) {
      log.warn({ reaped: reaped.count }, 'cron/broadcasts: ré-armé des PROCESSING coincés → SCHEDULED');
    }

    // Claim BORNÉ (Audit v2 #7.3) : on sélectionne d'abord les BATCH_SIZE
    // broadcasts qu'on va RÉELLEMENT traiter, puis on ne flippe QUE ceux-là.
    // Avant : updateMany flippait TOUS les SCHEDULED dûs → le surplus au-delà de
    // BATCH_SIZE restait PROCESSING à jamais (jamais re-claimé car plus aucun
    // SCHEDULED) → broadcast 10k+ destinataires silencieusement jamais envoyé.
    const due = await prisma.emailBroadcast.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true },
    });

    if (due.length === 0) {
      const result = { ok: true, latencyMs: Date.now() - start, processed: 0, reaped: reaped.count };
      void pingCronHealthcheck('broadcasts', 'success', { processed: 0 });
      void recordCronRun({ name: 'broadcasts', status: 'success', latencyMs: Date.now() - start, data: { processed: 0, reaped: reaped.count } });
      return NextResponse.json(result);
    }

    const ids = due.map((d) => d.id);
    // Claim atomique scopé aux IDs sélectionnés ; le WHERE status='SCHEDULED'
    // garde contre un run concurrent (le 1er flippe, le 2e ne matche plus).
    const claim = await prisma.emailBroadcast.updateMany({
      where: { id: { in: ids }, status: 'SCHEDULED' },
      data: { status: 'PROCESSING' },
    });

    // Re-fetch UNIQUEMENT les rows de ce claim (id IN ids, désormais PROCESSING).
    const ready = await prisma.emailBroadcast.findMany({
      where: { id: { in: ids }, status: 'PROCESSING' },
      orderBy: { scheduledAt: 'asc' },
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
      reaped: reaped.count,
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
