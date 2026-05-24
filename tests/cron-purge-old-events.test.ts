/**
 * Tests pour GET /api/cron/purge-old-events — Round 29 #2.
 *
 * Lock-in :
 *   - Auth Bearer requise en prod
 *   - Cutoff = now - 2 ans
 *   - Filter status in TERMINAL_STATUSES (jamais purger les actives)
 *   - DRY_RUN env → count only, pas de delete
 *   - Audit log via recordCronRun + countToDelete
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findMany: vi.fn() },
    orderEvent: { count: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub };
});

import { prisma } from '@/lib/db';

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request('http://localhost/api/cron/purge-old-events', { headers });
}

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  process.env = { ...ORIG_ENV, CRON_SECRET: 'test_secret', NODE_ENV: 'production' };
  vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.orderEvent.count).mockResolvedValue(0);
  vi.mocked(prisma.orderEvent.deleteMany).mockResolvedValue({ count: 0 } as never);
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe('GET /api/cron/purge-old-events (Round 29 #2)', () => {
  it('401 si Bearer manquant en prod', async () => {
    const { GET } = await import('@/app/api/cron/purge-old-events/route');
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it('Where clause : status terminal + createdAt < now - 2 ans', async () => {
    const { GET } = await import('@/app/api/cron/purge-old-events/route');
    await GET(makeReq('Bearer test_secret') as never);
    const args = vi.mocked(prisma.order.findMany).mock.calls[0]![0];
    expect(args?.where).toMatchObject({
      status: { in: ['DELIVERED', 'CANCELLED', 'FAILED'] },
    });
    const cutoffArg = (args?.where as { createdAt?: { lt: Date } } | undefined)?.createdAt?.lt;
    expect(cutoffArg).toBeInstanceOf(Date);
    // Cutoff = now - 2 ans ± 1 min margin
    const expectedCutoffMs = Date.now() - 2 * 365 * 24 * 3600 * 1000;
    expect(Math.abs(cutoffArg!.getTime() - expectedCutoffMs)).toBeLessThan(60_000);
  });

  it('200 + zero eligible → pas de delete + pas de count', async () => {
    const { GET } = await import('@/app/api/cron/purge-old-events/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, eligibleOrders: 0, deletedEvents: 0 });
    expect(prisma.orderEvent.deleteMany).not.toHaveBeenCalled();
    expect(prisma.orderEvent.count).not.toHaveBeenCalled();
  });

  it('200 + delete events des eligible orders', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'o1' }, { id: 'o2' }, { id: 'o3' },
    ] as never);
    vi.mocked(prisma.orderEvent.count).mockResolvedValue(15);
    vi.mocked(prisma.orderEvent.deleteMany).mockResolvedValue({ count: 15 } as never);

    const { GET } = await import('@/app/api/cron/purge-old-events/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();

    expect(json.eligibleOrders).toBe(3);
    expect(json.countToDelete).toBe(15);
    expect(json.deletedEvents).toBe(15);

    const delArgs = vi.mocked(prisma.orderEvent.deleteMany).mock.calls[0]![0];
    expect(delArgs?.where).toEqual({ orderId: { in: ['o1', 'o2', 'o3'] } });
  });

  it('PURGE_DRY_RUN=1 → count only, jamais delete', async () => {
    process.env.PURGE_DRY_RUN = '1';
    vi.mocked(prisma.order.findMany).mockResolvedValue([{ id: 'o1' }] as never);
    vi.mocked(prisma.orderEvent.count).mockResolvedValue(7);

    const { GET } = await import('@/app/api/cron/purge-old-events/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.dryRun).toBe(true);
    expect(json.countToDelete).toBe(7);
    expect(json.deletedEvents).toBe(0);
    expect(prisma.orderEvent.deleteMany).not.toHaveBeenCalled();
  });

  it('500 si findMany throw → recordCronRun fail', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValueOnce(new Error('DB down'));
    const { GET } = await import('@/app/api/cron/purge-old-events/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
