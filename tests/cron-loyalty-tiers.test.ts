/**
 * Tests pour /api/cron/loyalty-tiers — Round 15 #5.
 *
 * Cible :
 *   - Garde auth (CRON_SECRET)
 *   - Upgrade / downgrade / unchanged paths
 *   - Stats retournées
 *   - Best-effort sur les pings healthcheck / recordCronRun
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      groupBy: vi.fn(async () => []),
    },
    user: {
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/lib/cron/healthcheck', () => ({
  pingCronHealthcheck: vi.fn(async () => ({})),
}));

vi.mock('@/lib/cron/runs', () => ({
  recordCronRun: vi.fn(async () => ({})),
}));

import { prisma } from '@/lib/db';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';

const URL = 'http://localhost/api/cron/loyalty-tiers';

function makeReq(headers: Record<string, string> = {}) {
  return new NextRequest(URL, { method: 'GET', headers });
}

beforeEach(() => {
  vi.mocked(prisma.order.groupBy).mockClear();
  vi.mocked(prisma.user.findMany).mockClear();
  vi.mocked(prisma.user.update).mockClear();
  vi.mocked(pingCronHealthcheck).mockClear();
  vi.mocked(recordCronRun).mockClear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/cron/loyalty-tiers — auth gate', () => {
  it('401 si CRON_SECRET configuré + header mismatch', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret');
    const { GET } = await import('@/app/api/cron/loyalty-tiers/route');
    const res = await GET(makeReq({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(prisma.order.groupBy).not.toHaveBeenCalled();
  });

  it('503 si production sans CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/cron/loyalty-tiers/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(503);
  });

  it('200 + run si CRON_SECRET match', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret');
    const { GET } = await import('@/app/api/cron/loyalty-tiers/route');
    const res = await GET(makeReq({ authorization: 'Bearer topsecret' }));
    expect(res.status).toBe(200);
    expect(prisma.order.groupBy).toHaveBeenCalledOnce();
  });
});

describe('/api/cron/loyalty-tiers — upgrade/downgrade logic', () => {
  it('Upgrade : user BRONZE → SILVER quand revenu >= 500$', async () => {
    vi.stubEnv('CRON_SECRET', 't');

    vi.mocked(prisma.order.groupBy).mockResolvedValueOnce([
      { userId: 'user_A', _sum: { amountCents: 50_000 } }, // 500$ = SILVER
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never); // pas de non-BRONZE existants

    const { GET } = await import('@/app/api/cron/loyalty-tiers/route');
    const res = await GET(makeReq({ authorization: 'Bearer t' }));
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.upgraded).toBe(1);
    expect(json.downgraded).toBe(0);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_A' },
      data: expect.objectContaining({ loyaltyTier: 'SILVER' }),
    }));
  });

  it('Upgrade : SILVER → GOLD quand revenu >= 2000$', async () => {
    vi.stubEnv('CRON_SECRET', 't');

    vi.mocked(prisma.order.groupBy).mockResolvedValueOnce([
      { userId: 'user_B', _sum: { amountCents: 250_000 } }, // 2500$ = GOLD
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 'user_B', loyaltyTier: 'SILVER' },
    ] as never);

    const { GET } = await import('@/app/api/cron/loyalty-tiers/route');
    await GET(makeReq({ authorization: 'Bearer t' }));

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_B' },
      data: expect.objectContaining({ loyaltyTier: 'GOLD' }),
    }));
  });

  it('Downgrade : non-BRONZE sans revenue récent → BRONZE', async () => {
    vi.stubEnv('CRON_SECRET', 't');

    vi.mocked(prisma.order.groupBy).mockResolvedValueOnce([] as never); // aucun revenue
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 'user_C', loyaltyTier: 'GOLD' }, // GOLD sans revenue récent
    ] as never);

    const { GET } = await import('@/app/api/cron/loyalty-tiers/route');
    const res = await GET(makeReq({ authorization: 'Bearer t' }));
    const json = await res.json();

    expect(json.downgraded).toBe(1);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user_C' },
      data: expect.objectContaining({ loyaltyTier: 'BRONZE' }),
    }));
  });

  it('Unchanged : user reste au même tier (pas d\'update)', async () => {
    vi.stubEnv('CRON_SECRET', 't');

    vi.mocked(prisma.order.groupBy).mockResolvedValueOnce([
      { userId: 'user_D', _sum: { amountCents: 50_000 } }, // 500$ = SILVER
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 'user_D', loyaltyTier: 'SILVER' }, // déjà SILVER
    ] as never);

    const { GET } = await import('@/app/api/cron/loyalty-tiers/route');
    const res = await GET(makeReq({ authorization: 'Bearer t' }));
    const json = await res.json();

    expect(json.upgraded).toBe(0);
    expect(json.downgraded).toBe(0);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('Health + cron run pingés sur success', async () => {
    vi.stubEnv('CRON_SECRET', 't');
    const { GET } = await import('@/app/api/cron/loyalty-tiers/route');
    await GET(makeReq({ authorization: 'Bearer t' }));
    expect(pingCronHealthcheck).toHaveBeenCalledWith('loyalty-tiers', 'success', expect.any(Object));
    expect(recordCronRun).toHaveBeenCalledWith(expect.objectContaining({
      name: 'loyalty-tiers',
      status: 'success',
    }));
  });

  it('Health + cron run pingés "fail" si DB throw', async () => {
    vi.stubEnv('CRON_SECRET', 't');
    vi.mocked(prisma.order.groupBy).mockRejectedValueOnce(new Error('db down'));
    const { GET } = await import('@/app/api/cron/loyalty-tiers/route');
    const res = await GET(makeReq({ authorization: 'Bearer t' }));
    expect(res.status).toBe(500);
    expect(pingCronHealthcheck).toHaveBeenCalledWith('loyalty-tiers', 'fail', expect.any(Object));
    expect(recordCronRun).toHaveBeenCalledWith(expect.objectContaining({
      name: 'loyalty-tiers',
      status: 'fail',
    }));
  });
});
