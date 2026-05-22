/**
 * Shared helper pour compter les WebhookEvent en état "dead-letter".
 *
 * Round 26 #4. Extrait de cron/webhook-deadletter-alert/route.ts pour que
 * /api/health puisse exposer la même metric aux monitoring tools sans
 * duplication. Single source of truth pour "qu'est-ce qu'un dead-letter".
 *
 * Définition canonique :
 *   - success = false (handler failed)
 *   - processedAt < now - 24h (stale, pas un transient blip)
 *   - replayCount = 0 (jamais resolved manuellement)
 *
 * Trois consommateurs :
 *   1. cron/webhook-deadletter-alert → ping Slack si > threshold
 *   2. /api/health → expose count aux monitors externes
 *   3. /admin/webhooks?status=failed → UI manuel
 */

import { prisma } from '@/lib/db';

const STALENESS_MS = 24 * 60 * 60 * 1000;

export interface DeadLetterCount {
  total: number;
  bySource: Record<string, number>;
}

export async function countDeadLetterWebhooks(now: Date = new Date()): Promise<DeadLetterCount> {
  const staleCutoff = new Date(now.getTime() - STALENESS_MS);

  const groups = await prisma.webhookEvent.groupBy({
    by: ['source'],
    where: {
      success: false,
      processedAt: { lt: staleCutoff },
      replayCount: 0,
    },
    _count: { _all: true },
  });

  const total = groups.reduce((acc, g) => acc + g._count._all, 0);
  const bySource = Object.fromEntries(groups.map((g) => [g.source, g._count._all]));

  return { total, bySource };
}
