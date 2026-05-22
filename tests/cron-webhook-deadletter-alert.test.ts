/**
 * Tests pour GET /api/cron/webhook-deadletter-alert — Round 25 #2.
 *
 * Invariants critiques :
 *   - Auth Bearer required en prod
 *   - Sous threshold → pas d'alert
 *   - Sur threshold → alert Slack envoyée
 *   - Throttle : si un alert a été envoyée < 6h, skip
 *   - Failure de Slack/healthcheck/cronRun ne crash pas le cron
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    webhookEvent: { groupBy: vi.fn() },
    cronRun: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => true),
}));

vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
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
  return new Request('http://localhost/api/cron/webhook-deadletter-alert', { headers });
}

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIG_ENV, CRON_SECRET: 'test_secret', NODE_ENV: 'production', WEBHOOK_DEAD_LETTER_THRESHOLD: '5' };
  vi.mocked(prisma.webhookEvent.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.cronRun.findFirst).mockResolvedValue(null as never);
});

describe('GET /api/cron/webhook-deadletter-alert', () => {
  it('401 si Bearer manquant en prod', async () => {
    const { GET } = await import('@/app/api/cron/webhook-deadletter-alert/route');
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it('401 si Bearer wrong', async () => {
    const { GET } = await import('@/app/api/cron/webhook-deadletter-alert/route');
    const res = await GET(makeReq('Bearer wrong') as never);
    expect(res.status).toBe(401);
  });

  it('200 + total:0 + alerted:false quand aucun dead-letter', async () => {
    const { GET } = await import('@/app/api/cron/webhook-deadletter-alert/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, total: 0, alerted: false });
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('sous threshold (3 < 5) → pas d\'alert', async () => {
    vi.mocked(prisma.webhookEvent.groupBy).mockResolvedValueOnce([
      { source: 'STRIPE', _count: { _all: 3 } },
    ] as never);
    const { GET } = await import('@/app/api/cron/webhook-deadletter-alert/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.total).toBe(3);
    expect(json.alerted).toBe(false);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('au seuil (5 == 5) → alert Slack avec context', async () => {
    vi.mocked(prisma.webhookEvent.groupBy).mockResolvedValueOnce([
      { source: 'STRIPE', _count: { _all: 3 } },
      { source: 'SINALITE', _count: { _all: 2 } },
    ] as never);
    const { GET } = await import('@/app/api/cron/webhook-deadletter-alert/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.total).toBe(5);
    expect(json.alerted).toBe(true);
    expect(sendCriticalAlert).toHaveBeenCalledOnce();
    const call = vi.mocked(sendCriticalAlert).mock.calls[0]![0];
    expect(call.severity).toBe('warning');
    expect(call.title).toMatch(/5.*dead-letter/);
    expect(call.context).toMatchObject({
      total: 5,
      bySource: { STRIPE: 3, SINALITE: 2 },
      threshold: 5,
    });
    expect(call.actionUrl).toMatch(/\/admin\/webhooks/);
  });

  it('au-dessus du seuil (10 > 5) → alert Slack', async () => {
    vi.mocked(prisma.webhookEvent.groupBy).mockResolvedValueOnce([
      { source: 'STRIPE', _count: { _all: 10 } },
    ] as never);
    const { GET } = await import('@/app/api/cron/webhook-deadletter-alert/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.alerted).toBe(true);
    expect(sendCriticalAlert).toHaveBeenCalledOnce();
  });

  it('throttle : si un alert a été envoyée < 6h → skip', async () => {
    vi.mocked(prisma.webhookEvent.groupBy).mockResolvedValueOnce([
      { source: 'STRIPE', _count: { _all: 10 } },
    ] as never);
    // CronRun précédent il y a 1h, avec alerted:true
    vi.mocked(prisma.cronRun.findFirst).mockResolvedValueOnce({
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      data: JSON.stringify({ alerted: true }),
    } as never);

    const { GET } = await import('@/app/api/cron/webhook-deadletter-alert/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.alerted).toBe(false);
    expect(json.throttled).toBe(true);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('throttle expiré : si alert envoyée il y a > 6h → re-alert', async () => {
    vi.mocked(prisma.webhookEvent.groupBy).mockResolvedValueOnce([
      { source: 'STRIPE', _count: { _all: 10 } },
    ] as never);
    vi.mocked(prisma.cronRun.findFirst).mockResolvedValueOnce({
      createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000), // 7h ago
      data: JSON.stringify({ alerted: true }),
    } as never);

    const { GET } = await import('@/app/api/cron/webhook-deadletter-alert/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.alerted).toBe(true);
    expect(json.throttled).toBe(false);
    expect(sendCriticalAlert).toHaveBeenCalledOnce();
  });

  it('groupBy filtre success=false + stales + replayCount=0', async () => {
    const { GET } = await import('@/app/api/cron/webhook-deadletter-alert/route');
    await GET(makeReq('Bearer test_secret') as never);
    const call = vi.mocked(prisma.webhookEvent.groupBy).mock.calls[0][0];
    expect(call.where).toMatchObject({
      success: false,
      replayCount: 0,
    });
    expect(call.where?.processedAt).toBeDefined();
  });
});
