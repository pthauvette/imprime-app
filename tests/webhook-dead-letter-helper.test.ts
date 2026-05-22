/**
 * Tests pour countDeadLetterWebhooks() — Round 26 #4.
 *
 * Shared helper consumé par 2 endpoints :
 *   - cron/webhook-deadletter-alert (Round 25 #2) → Slack
 *   - /api/health → monitoring tools
 *
 * Le test lock-in la définition canonique d'un "dead-letter" :
 *   - success = false
 *   - processedAt < now - 24h
 *   - replayCount = 0
 *
 * Si quelqu'un change la définition côté cron sans toucher health (ou
 * vice-versa), les deux consumers drift. Single source of truth = ce
 * helper, lock-in par ce test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    webhookEvent: { groupBy: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { countDeadLetterWebhooks } from '@/lib/webhooks/dead-letter';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('countDeadLetterWebhooks()', () => {
  it('groupBy avec where canonique : success=false + processedAt < now-24h + replayCount=0', async () => {
    vi.mocked(prisma.webhookEvent.groupBy).mockResolvedValueOnce([] as never);

    const fixedNow = new Date('2026-05-22T12:00:00Z');
    await countDeadLetterWebhooks(fixedNow);

    const args = vi.mocked(prisma.webhookEvent.groupBy).mock.calls[0][0];
    expect(args.where).toMatchObject({
      success: false,
      replayCount: 0,
    });

    // Cutoff = fixedNow - 24h
    const expectedCutoff = new Date('2026-05-21T12:00:00Z');
    const whereProcessedAt = args.where?.processedAt as { lt: Date };
    expect(whereProcessedAt.lt.toISOString()).toBe(expectedCutoff.toISOString());

    // groupBy par source pour le bySource breakdown
    expect(args.by).toEqual(['source']);
  });

  it('total = somme bySource', async () => {
    vi.mocked(prisma.webhookEvent.groupBy).mockResolvedValueOnce([
      { source: 'STRIPE', _count: { _all: 3 } },
      { source: 'SINALITE', _count: { _all: 2 } },
    ] as never);

    const r = await countDeadLetterWebhooks(new Date());

    expect(r.total).toBe(5);
    expect(r.bySource).toEqual({ STRIPE: 3, SINALITE: 2 });
  });

  it('résultat vide → total 0 + bySource {}', async () => {
    vi.mocked(prisma.webhookEvent.groupBy).mockResolvedValueOnce([] as never);

    const r = await countDeadLetterWebhooks(new Date());

    expect(r.total).toBe(0);
    expect(r.bySource).toEqual({});
  });

  it('default now() utilisé si pas de param', async () => {
    vi.mocked(prisma.webhookEvent.groupBy).mockResolvedValueOnce([] as never);
    await countDeadLetterWebhooks();
    expect(prisma.webhookEvent.groupBy).toHaveBeenCalledTimes(1);
  });
});
