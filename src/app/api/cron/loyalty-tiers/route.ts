/**
 * GET /api/cron/loyalty-tiers
 *
 * Recompute le loyalty tier de chaque user basé sur le revenu net 365
 * derniers jours. Run monthly (le 1er à 5h UTC).
 *
 * Stratégie : groupBy Order par userId avec paidAt > 365j, sum amountCents,
 * compute tier, update User si différent du tier actuel.
 *
 * Cap : si on a > 50k users actifs un jour, on chunkera. Pour MVP (200
 * users actifs) on bat tout en 1 query.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { computeLoyaltyTier } from '@/lib/customers/loyalty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'loyalty-tiers');
  if (denied) return denied;

  const start = Date.now();
  const cutoff365 = new Date(Date.now() - 365 * 24 * 3600 * 1000);
  let upgraded = 0;
  let downgraded = 0;
  let unchanged = 0;

  try {
    // 1. Aggregate revenue par userId pour les 365 derniers jours
    const revenueByUser = await prisma.order.groupBy({
      by: ['userId'],
      where: {
        paidAt: { gte: cutoff365 },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      _sum: { amountCents: true },
    });

    // 2. Fetch tous les users actifs (qui ont au moins 1 row dans groupBy
    //    + ceux qui ne sont plus actifs mais avec tier > BRONZE — à downgrade)
    const userIdsWithRevenue = new Set(revenueByUser.map((r) => r.userId));
    const usersNonBronze = await prisma.user.findMany({
      where: { loyaltyTier: { not: 'BRONZE' } },
      select: { id: true, loyaltyTier: true },
    });

    // Construit la map userId → tier actuel pour les non-BRONZE
    const currentTierMap = new Map(usersNonBronze.map((u) => [u.id, u.loyaltyTier]));

    // Pour chaque user avec revenue récent : compute le bon tier
    const updates: Array<{ userId: string; newTier: string; oldTier: string }> = [];
    for (const row of revenueByUser) {
      const revenue = row._sum.amountCents ?? 0;
      const newTier = computeLoyaltyTier({ revenueLast365dCents: revenue });
      const oldTier = currentTierMap.get(row.userId) ?? 'BRONZE';
      if (newTier !== oldTier) {
        updates.push({ userId: row.userId, newTier, oldTier });
      }
    }

    // Aussi : les users non-BRONZE sans revenue récent → downgrade to BRONZE
    for (const u of usersNonBronze) {
      if (!userIdsWithRevenue.has(u.id)) {
        updates.push({ userId: u.id, newTier: 'BRONZE', oldTier: u.loyaltyTier });
      }
    }

    const now = new Date();
    // Apply en batch pour pas spam Prisma
    for (const u of updates) {
      await prisma.user.update({
        where: { id: u.userId },
        data: {
          loyaltyTier: u.newTier,
          loyaltyTierComputedAt: now,
        },
      });
      const oldRank = tierRank(u.oldTier);
      const newRank = tierRank(u.newTier);
      if (newRank > oldRank) upgraded++;
      else if (newRank < oldRank) downgraded++;
    }
    unchanged = revenueByUser.length - upgraded - downgraded;

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      usersWithRevenue: revenueByUser.length,
      upgraded,
      downgraded,
      unchanged,
    };
    log.info(result, 'cron/loyalty-tiers ran');
    await pingCronHealthcheck('loyalty-tiers', 'success', { upgraded, downgraded });
    await recordCronRun({
      name: 'loyalty-tiers',
      status: 'success',
      latencyMs: Date.now() - start,
      data: { upgraded, downgraded, unchanged, totalProcessed: revenueByUser.length },
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/loyalty-tiers failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    await pingCronHealthcheck('loyalty-tiers', 'fail', { error: errMsg });
    await recordCronRun({
      name: 'loyalty-tiers',
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

function tierRank(t: string): number {
  if (t === 'GOLD') return 3;
  if (t === 'SILVER') return 2;
  return 1; // BRONZE
}
