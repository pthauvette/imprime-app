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
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { shouldBePlatinum, PLATINUM_REVENUE_THRESHOLD_CENTS } from '@/lib/reseller/perks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESELLER_MIN_ORDERS = 5;
const WINDOW_DAYS = 365;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'reseller-detection');
  if (denied) return denied;

  const start = Date.now();
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  let promoted = 0;
  let demoted = 0;
  // Round 33 — PLATINUM movements distincts pour visibilité KPI.
  let platinumUpgraded = 0;
  let platinumDowngraded = 0;

  try {
    // 1. groupBy Order par userId sur 365j hors CANCELLED/FAILED
    //    + sum amountCents pour le seuil PLATINUM revenue-based.
    const orderStats = await prisma.order.groupBy({
      by: ['userId'],
      where: {
        paidAt: { gte: cutoff },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      _count: { _all: true },
      _sum: { amountCents: true },
    });

    const countsByUser = new Map(orderStats.map((g) => [g.userId, g._count._all]));
    const revenueByUser = new Map(orderStats.map((g) => [g.userId, g._sum.amountCents ?? 0]));

    // 2. Fetch users : ceux qui sont actifs (in countsByUser) OR ceux qui
    //    sont AUTO_DETECTED, VERIFIED ou PLATINUM (pour possibles déclassements).
    //    Round 33 — VERIFIED inclus pour upgrade vers PLATINUM, PLATINUM inclus
    //    pour downgrade VERIFIED si revenue tombe.
    const candidateIds = new Set(countsByUser.keys());
    const upgradable = await prisma.user.findMany({
      where: { resellerStatus: { in: ['AUTO_DETECTED', 'VERIFIED', 'PLATINUM'] } },
      select: { id: true },
    });
    for (const u of upgradable) candidateIds.add(u.id);

    if (candidateIds.size === 0) {
      const result = { ok: true, latencyMs: Date.now() - start, promoted: 0, demoted: 0, platinumUpgraded: 0, platinumDowngraded: 0 };
      await pingCronHealthcheck('reseller-detection', 'success', result);
      await recordCronRun({ name: 'reseller-detection', status: 'success', latencyMs: Date.now() - start, data: result });
      return NextResponse.json(result);
    }

    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(candidateIds) } },
      select: { id: true, resellerStatus: true },
    });

    const now = new Date();

    for (const u of users) {
      const orderCount = countsByUser.get(u.id) ?? 0;
      const revenue = revenueByUser.get(u.id) ?? 0;
      const meetsOrderThreshold = orderCount >= RESELLER_MIN_ORDERS;
      const meetsPlatinumThreshold = shouldBePlatinum(revenue);

      // Promotion NONE → AUTO_DETECTED (jamais touche VERIFIED/PLATINUM)
      if (meetsOrderThreshold && u.resellerStatus === 'NONE') {
        await prisma.user.update({
          where: { id: u.id },
          data: { resellerStatus: 'AUTO_DETECTED', resellerDetectedAt: now },
        });
        promoted++;
      }
      // Déclassement AUTO_DETECTED → NONE si plus power-buyer
      else if (!meetsOrderThreshold && u.resellerStatus === 'AUTO_DETECTED') {
        await prisma.user.update({
          where: { id: u.id },
          data: { resellerStatus: 'NONE', resellerDetectedAt: null },
        });
        demoted++;
      }
      // Round 33 — Promotion VERIFIED → PLATINUM si revenue ≥ 20 000 $
      else if (meetsPlatinumThreshold && u.resellerStatus === 'VERIFIED') {
        await prisma.user.update({
          where: { id: u.id },
          data: { resellerStatus: 'PLATINUM' },
        });
        platinumUpgraded++;
      }
      // Round 33 — Déclassement PLATINUM → VERIFIED si revenue tombe
      // (à la différence de NONE/AUTO_DETECTED, VERIFIED garde son badge admin
      // donc on retombe à VERIFIED pas NONE — perks 5 % préservés)
      else if (!meetsPlatinumThreshold && u.resellerStatus === 'PLATINUM') {
        await prisma.user.update({
          where: { id: u.id },
          data: { resellerStatus: 'VERIFIED' },
        });
        platinumDowngraded++;
      }
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      candidatesScanned: users.length,
      promoted,
      demoted,
      platinumUpgraded,
      platinumDowngraded,
      platinumThresholdCents: PLATINUM_REVENUE_THRESHOLD_CENTS,
    };
    log.info(result, 'cron/reseller-detection ran');
    await pingCronHealthcheck('reseller-detection', 'success', { promoted, demoted });
    await recordCronRun({
      name: 'reseller-detection',
      status: 'success',
      latencyMs: Date.now() - start,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/reseller-detection failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    await pingCronHealthcheck('reseller-detection', 'fail', { error: errMsg });
    await recordCronRun({
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
