/**
 * GET /api/cron/reseller-detection
 *
 * Round 21 #4 — scan mensuel pour auto-flag les users power-buyers
 * comme RESELLER candidate.
 *
 * Logique :
 *   - Pour chaque user, count orders status NOT IN (CANCELLED, FAILED) sur 365j
 *   - Si >= 5 orders ET status courant = NONE → bascule AUTO_DETECTED
 *     + resellerDetectedAt = now
 *   - Si < 5 ET status = AUTO_DETECTED (pas VERIFIED) → bascule NONE
 *     (déclassement auto, le user n'est plus power-buyer)
 *   - VERIFIED ne se déclasse jamais auto (admin choice)
 *
 * Run monthly (1er du mois 7h UTC, après loyalty-tiers).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const RESELLER_MIN_ORDERS = 5;
const WINDOW_DAYS = 365;

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      log.error('cron/reseller-detection: CRON_SECRET not set in production');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    log.warn('cron/reseller-detection: CRON_SECRET not set — allowing in non-prod');
  } else {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  let promoted = 0;
  let demoted = 0;

  try {
    // 1. groupBy Order par userId sur 365j hors CANCELLED/FAILED
    const orderCounts = await prisma.order.groupBy({
      by: ['userId'],
      where: {
        paidAt: { gte: cutoff },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      _count: { _all: true },
    });

    const countsByUser = new Map(orderCounts.map((g) => [g.userId, g._count._all]));

    // 2. Fetch users : ceux qui sont actifs (in countsByUser) OR ceux qui
    //    sont AUTO_DETECTED (pour possibles déclassements).
    const candidateIds = new Set(countsByUser.keys());
    const autoDetected = await prisma.user.findMany({
      where: { resellerStatus: 'AUTO_DETECTED' },
      select: { id: true },
    });
    for (const u of autoDetected) candidateIds.add(u.id);

    if (candidateIds.size === 0) {
      const result = { ok: true, latencyMs: Date.now() - start, promoted: 0, demoted: 0 };
      void pingCronHealthcheck('reseller-detection', 'success', result);
      void recordCronRun({ name: 'reseller-detection', status: 'success', latencyMs: Date.now() - start, data: result });
      return NextResponse.json(result);
    }

    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(candidateIds) } },
      select: { id: true, resellerStatus: true },
    });

    const now = new Date();

    for (const u of users) {
      const orderCount = countsByUser.get(u.id) ?? 0;
      const meetsThreshold = orderCount >= RESELLER_MIN_ORDERS;

      // Promotion : NONE → AUTO_DETECTED (jamais touche VERIFIED)
      if (meetsThreshold && u.resellerStatus === 'NONE') {
        await prisma.user.update({
          where: { id: u.id },
          data: { resellerStatus: 'AUTO_DETECTED', resellerDetectedAt: now },
        });
        promoted++;
      }
      // Déclassement : AUTO_DETECTED → NONE si plus power-buyer.
      // VERIFIED ne perd jamais le badge auto (admin manual revoke only).
      else if (!meetsThreshold && u.resellerStatus === 'AUTO_DETECTED') {
        await prisma.user.update({
          where: { id: u.id },
          data: { resellerStatus: 'NONE', resellerDetectedAt: null },
        });
        demoted++;
      }
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      candidatesScanned: users.length,
      promoted,
      demoted,
    };
    log.info(result, 'cron/reseller-detection ran');
    void pingCronHealthcheck('reseller-detection', 'success', { promoted, demoted });
    void recordCronRun({
      name: 'reseller-detection',
      status: 'success',
      latencyMs: Date.now() - start,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/reseller-detection failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('reseller-detection', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'reseller-detection',
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
