/**
 * Tests pour recordCronRun + cleanupOldCronRuns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    cronRun: {
      create: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 42 })),
    },
  },
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return {
    log: stub, logStripe: stub, logSinalite: stub, logAuth: stub,
    logEmail: stub, logS3: stub, logAdmin: stub, logWebhook: stub,
  };
});

import { prisma } from '@/lib/db';
import { recordCronRun, cleanupOldCronRuns } from '@/lib/cron/runs';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordCronRun', () => {
  it('insert success run avec data JSON-stringified', async () => {
    await recordCronRun({
      name: 'cleanup',
      status: 'success',
      latencyMs: 1234,
      data: { rows: 42 },
    });
    expect(prisma.cronRun.create).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.cronRun.create).mock.calls[0][0];
    expect(call.data.name).toBe('cleanup');
    expect(call.data.status).toBe('success');
    expect(call.data.latencyMs).toBe(1234);
    expect(call.data.data).toBe('{"rows":42}');
    expect(call.data.errorMessage).toBeNull();
  });

  it('insert fail run avec errorMessage truncated 500 chars', async () => {
    const longErr = 'x'.repeat(700);
    await recordCronRun({
      name: 'email-retry',
      status: 'fail',
      latencyMs: 50,
      errorMessage: longErr,
    });
    const call = vi.mocked(prisma.cronRun.create).mock.calls[0][0];
    expect(call.data.errorMessage).toHaveLength(500);
  });

  it('latencyMs négatif → 0 (defensive)', async () => {
    await recordCronRun({ name: 'x', status: 'success', latencyMs: -100 });
    const call = vi.mocked(prisma.cronRun.create).mock.calls[0][0];
    expect(call.data.latencyMs).toBe(0);
  });

  it('latencyMs flottant arrondi', async () => {
    await recordCronRun({ name: 'x', status: 'success', latencyMs: 123.7 });
    const call = vi.mocked(prisma.cronRun.create).mock.calls[0][0];
    expect(call.data.latencyMs).toBe(124);
  });

  it('data JSON-stringified truncated à 10kB', async () => {
    const huge = { big: 'x'.repeat(20_000) };
    await recordCronRun({
      name: 'x',
      status: 'success',
      latencyMs: 1,
      data: huge,
    });
    const call = vi.mocked(prisma.cronRun.create).mock.calls[0][0];
    expect(String(call.data.data).length).toBeLessThanOrEqual(10_000);
  });

  it('best-effort : ne throw jamais même si DB down', async () => {
    vi.mocked(prisma.cronRun.create).mockRejectedValueOnce(new Error('DB down'));
    await expect(
      recordCronRun({ name: 'x', status: 'success', latencyMs: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe('cleanupOldCronRuns', () => {
  it('delete les rows > 30 jours par défaut', async () => {
    const count = await cleanupOldCronRuns();
    expect(count).toBe(42);
    const call = vi.mocked(prisma.cronRun.deleteMany).mock.calls[0][0];
    const cutoff = (call?.where?.createdAt as { lt: Date } | undefined)?.lt;
    expect(cutoff).toBeInstanceOf(Date);
    // Within tolerance of "30 days ago"
    const expected = Date.now() - 30 * 24 * 3600 * 1000;
    expect(Math.abs((cutoff as Date).getTime() - expected)).toBeLessThan(5000);
  });

  it('accepte un cutoff custom', async () => {
    await cleanupOldCronRuns(7);
    const call = vi.mocked(prisma.cronRun.deleteMany).mock.calls[0][0];
    const cutoff = (call?.where?.createdAt as { lt: Date }).lt;
    const expected = Date.now() - 7 * 24 * 3600 * 1000;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(5000);
  });
});
