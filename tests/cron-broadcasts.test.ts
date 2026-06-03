/**
 * GET /api/cron/broadcasts — Audit v2 #7.3.
 *
 * Verrouille : le claim ne flippe QUE les BATCH_SIZE broadcasts traités ce run
 * (plus de surplus stranded en PROCESSING) + un reaper ré-arme les PROCESSING
 * coincés.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    emailBroadcast: {
      updateMany: vi.fn(async () => ({ count: 0 })),
      findMany: vi.fn(async () => []),
    },
  },
}));
vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
vi.mock('@/lib/broadcast/dispatch', () => ({
  dispatchBroadcast: vi.fn(async () => ({ enqueued: 100 })),
}));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { prisma } from '@/lib/db';
import { dispatchBroadcast } from '@/lib/broadcast/dispatch';

function makeReq() {
  return new Request('http://localhost/api/cron/broadcasts', {
    headers: { authorization: 'Bearer test_secret' },
  }) as never;
}

const ORIG_ENV = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIG_ENV, CRON_SECRET: 'test_secret', NODE_ENV: 'production' };
  vi.mocked(prisma.emailBroadcast.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.emailBroadcast.findMany).mockResolvedValue([] as never);
});

describe('cron/broadcasts — #7.3 claim borné + reaper', () => {
  it('401 si Bearer wrong', async () => {
    const { GET } = await import('@/app/api/cron/broadcasts/route');
    const res = await GET(new Request('http://localhost/api/cron/broadcasts', {
      headers: { authorization: 'Bearer wrong' },
    }) as never);
    expect(res.status).toBe(401);
  });

  it('le claim ne flippe QUE les IDs sélectionnés (WHERE id IN), pas tous les SCHEDULED', async () => {
    // 1er findMany (reaper n'utilise pas findMany) → "due" : 2 broadcasts dûs
    vi.mocked(prisma.emailBroadcast.findMany)
      .mockResolvedValueOnce([{ id: 'b1' }, { id: 'b2' }] as never) // due (select id)
      .mockResolvedValueOnce([
        { id: 'b1', subject: 's', body: 'b', segment: 'ALL', adminEmail: 'a@p.ca' },
        { id: 'b2', subject: 's', body: 'b', segment: 'ALL', adminEmail: 'a@p.ca' },
      ] as never); // ready (claimed rows)
    vi.mocked(prisma.emailBroadcast.updateMany)
      .mockResolvedValueOnce({ count: 0 } as never)  // reaper
      .mockResolvedValueOnce({ count: 2 } as never); // claim

    const { GET } = await import('@/app/api/cron/broadcasts/route');
    const res = await GET(makeReq());
    const json = await res.json();

    // le claim (2e updateMany) est scopé par id IN [b1,b2] + status SCHEDULED
    const claimCall = vi.mocked(prisma.emailBroadcast.updateMany).mock.calls[1]![0];
    expect(claimCall.where).toEqual({ id: { in: ['b1', 'b2'] }, status: 'SCHEDULED' });
    expect(dispatchBroadcast).toHaveBeenCalledTimes(2);
    expect(json.processed).toBe(2);
  });

  it('reaper : ré-arme les PROCESSING coincés (scheduledAt vieux) → SCHEDULED', async () => {
    vi.mocked(prisma.emailBroadcast.updateMany)
      .mockResolvedValueOnce({ count: 3 } as never) // reaper ré-arme 3
      .mockResolvedValueOnce({ count: 0 } as never); // claim
    // après reaping, supposons rien de nouveau dû ce tick (due vide)
    vi.mocked(prisma.emailBroadcast.findMany).mockResolvedValueOnce([] as never);

    const { GET } = await import('@/app/api/cron/broadcasts/route');
    const res = await GET(makeReq());
    const json = await res.json();

    // 1er updateMany = reaper : WHERE status PROCESSING + scheduledAt < cutoff
    const reaperCall = vi.mocked(prisma.emailBroadcast.updateMany).mock.calls[0]![0];
    const where = reaperCall.where as { status: string; scheduledAt: { lt: unknown } };
    expect(where.status).toBe('PROCESSING');
    expect(where.scheduledAt).toHaveProperty('lt');
    expect(reaperCall.data).toEqual({ status: 'SCHEDULED' });
    expect(json.reaped).toBe(3);
  });

  it('aucun broadcast dû → processed:0, pas de dispatch', async () => {
    const { GET } = await import('@/app/api/cron/broadcasts/route');
    const res = await GET(makeReq());
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(dispatchBroadcast).not.toHaveBeenCalled();
  });
});
