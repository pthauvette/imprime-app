/**
 * Tests pour GET /api/cron/sinalite-latency — Round 28 #3.
 *
 * Lock-in :
 *   - Auth Bearer required en prod
 *   - Skip si Sinalite env missing (sans crash)
 *   - Probe = auth POST + product GET, record full RTT
 *   - Alert seulement si fenêtre pleine ET P95 > 3s (anti single-spike)
 *   - Fail gracieusement si auth ou product down → 500 + recordCronRun fail
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    cronRun: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert: vi.fn(async () => true) }));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub };
});

import { prisma } from '@/lib/db';
import { sendCriticalAlert } from '@/lib/alerting/slack';

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request('http://localhost/api/cron/sinalite-latency', { headers });
}

const ORIG_ENV = { ...process.env };
const ORIG_FETCH = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
  process.env = {
    ...ORIG_ENV,
    CRON_SECRET: 'test_secret',
    NODE_ENV: 'production',
    SINALITE_AUTH_BASE: 'https://auth.sinalite.fake',
    SINALITE_API_BASE: 'https://api.sinalite.fake',
    SINALITE_CLIENT_ID: 'id',
    SINALITE_CLIENT_SECRET: 'secret',
    SINALITE_AUDIENCE: 'aud',
  };
  vi.mocked(prisma.cronRun.findMany).mockResolvedValue([] as never);
});

afterEach(() => {
  global.fetch = ORIG_FETCH;
});

function mockSinaliteOk() {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/auth/token')) {
      return new Response(JSON.stringify({ access_token: 'fake_token' }), { status: 200 });
    }
    if (url.includes('/product/1')) {
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as never;
}

describe('GET /api/cron/sinalite-latency (Round 28 #3)', () => {
  it('401 si Bearer manquant en prod', async () => {
    const { GET } = await import('@/app/api/cron/sinalite-latency/route');
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it('skipped si SINALITE_CLIENT_ID missing (pas de crash)', async () => {
    delete process.env.SINALITE_CLIENT_ID;
    const { GET } = await import('@/app/api/cron/sinalite-latency/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, skipped: 'sinalite_not_configured' });
  });

  it('200 + latencyMs + probeHttpStatus quand OK', async () => {
    mockSinaliteOk();
    const { GET } = await import('@/app/api/cron/sinalite-latency/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.probeOk).toBe(true);
    expect(json.probeHttpStatus).toBe(200);
    expect(json.latencyMs).toBeGreaterThanOrEqual(0);
    expect(json.alerted).toBe(false); // pas assez de runs pour alert
  });

  it('500 + recordCronRun fail si auth Sinalite throw', async () => {
    global.fetch = vi.fn(async () => new Response('error', { status: 401 })) as never;
    const { GET } = await import('@/app/api/cron/sinalite-latency/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/HTTP 401/);
  });

  it('pas d\'alert si sample size < 4 (fenêtre incomplète, anti faux-positif au deploy)', async () => {
    mockSinaliteOk();
    // 2 runs précédents, current = 3 total → < 4
    vi.mocked(prisma.cronRun.findMany).mockResolvedValueOnce([
      { latencyMs: 4000 }, { latencyMs: 5000 },
    ] as never);
    const { GET } = await import('@/app/api/cron/sinalite-latency/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.alerted).toBe(false);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('alert si fenêtre pleine ET P95 > 3000ms', async () => {
    mockSinaliteOk();
    // 3 previous runs lents → fenêtre = 4 avec current, P95 va déclencher
    vi.mocked(prisma.cronRun.findMany).mockResolvedValueOnce([
      { latencyMs: 4500 }, { latencyMs: 4800 }, { latencyMs: 3200 },
    ] as never);
    const { GET } = await import('@/app/api/cron/sinalite-latency/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.sampleSize).toBe(4);
    expect(json.p95).toBeGreaterThan(3000);
    expect(json.alerted).toBe(true);
    expect(sendCriticalAlert).toHaveBeenCalledOnce();
    const call = vi.mocked(sendCriticalAlert).mock.calls[0]![0];
    expect(call.severity).toBe('warning');
    expect(call.title).toMatch(/Sinalite P95/);
  });

  it('pas d\'alert si fenêtre pleine MAIS P95 sous le seuil', async () => {
    mockSinaliteOk();
    vi.mocked(prisma.cronRun.findMany).mockResolvedValueOnce([
      { latencyMs: 200 }, { latencyMs: 300 }, { latencyMs: 400 },
    ] as never);
    const { GET } = await import('@/app/api/cron/sinalite-latency/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.alerted).toBe(false);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });
});
