/**
 * Tests pour /api/cron/cleanup — la garde auth + les deux deleteMany.
 *
 * On mock Prisma + on stub CRON_SECRET via vi.stubEnv pour tester les
 * deux états (configuré / non-configuré).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock prisma BEFORE the route imports it
vi.mock('@/lib/db', () => ({
  prisma: {
    draft: { deleteMany: vi.fn(async () => ({ count: 3 })) },
    designDraft: { deleteMany: vi.fn(async () => ({ count: 7 })) },
    // Mode B #3c — cleanup des Orders/claims headless orphelins.
    order: { updateMany: vi.fn(async () => ({ count: 0 })), findMany: vi.fn(async () => []) },
    mcpOrderIntent: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

import { prisma } from '@/lib/db';

const URL = 'http://localhost/api/cron/cleanup';

function makeReq(headers: Record<string, string> = {}) {
  return new NextRequest(URL, { method: 'GET', headers });
}

describe('/api/cron/cleanup — auth gate', () => {
  beforeEach(() => {
    vi.mocked(prisma.draft.deleteMany).mockClear();
    vi.mocked(prisma.designDraft.deleteMany).mockClear();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('401 si CRON_SECRET configuré et Authorization mismatch', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret123');
    const { GET } = await import('@/app/api/cron/cleanup/route');
    const res = await GET(makeReq({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(prisma.draft.deleteMany).not.toHaveBeenCalled();
    expect(prisma.designDraft.deleteMany).not.toHaveBeenCalled();
  });

  it('401 si CRON_SECRET configuré et pas de header', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret123');
    const { GET } = await import('@/app/api/cron/cleanup/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('200 si CRON_SECRET configuré et Authorization match', async () => {
    vi.stubEnv('CRON_SECRET', 'topsecret123');
    const { GET } = await import('@/app/api/cron/cleanup/route');
    const res = await GET(makeReq({ authorization: 'Bearer topsecret123' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      deleted: { drafts: 3, designDrafts: 7 },
    });
    expect(json.latencyMs).toBeTypeOf('number');
  });

  it('503 si production sans CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/cron/cleanup/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(503);
  });
});

describe('/api/cron/cleanup — cleanup logic', () => {
  beforeEach(() => {
    vi.mocked(prisma.draft.deleteMany).mockClear();
    vi.mocked(prisma.designDraft.deleteMany).mockClear();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Draft : where expiresAt < now', async () => {
    vi.stubEnv('CRON_SECRET', 'sec');
    const { GET } = await import('@/app/api/cron/cleanup/route');
    const before = new Date();
    await GET(makeReq({ authorization: 'Bearer sec' }));
    const after = new Date();
    const call = vi.mocked(prisma.draft.deleteMany).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    const expiresLt = call!.where!.expiresAt as { lt: Date };
    expect(expiresLt.lt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(expiresLt.lt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('DesignDraft : updatedAt < now - 30d ET orderId null', async () => {
    vi.stubEnv('CRON_SECRET', 'sec');
    const { GET } = await import('@/app/api/cron/cleanup/route');
    await GET(makeReq({ authorization: 'Bearer sec' }));
    const call = vi.mocked(prisma.designDraft.deleteMany).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call!.where!.orderId).toBeNull();
    const updatedLt = call!.where!.updatedAt as { lt: Date };
    const expected = Date.now() - 30 * 24 * 3600 * 1000;
    // 5 second tolerance
    expect(Math.abs(updatedLt.lt.getTime() - expected)).toBeLessThan(5000);
  });

  it('500 si Prisma throws', async () => {
    vi.stubEnv('CRON_SECRET', 'sec');
    vi.mocked(prisma.draft.deleteMany).mockRejectedValueOnce(new Error('db down'));
    const { GET } = await import('@/app/api/cron/cleanup/route');
    const res = await GET(makeReq({ authorization: 'Bearer sec' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: 'db down' });
  });
});
