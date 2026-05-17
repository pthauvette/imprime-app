/**
 * Tests pour /api/cron/daily-summary.
 *
 * Couvre :
 *   - Auth gate (header check, 401/503/200)
 *   - Calcul des KPIs (revenue, orders, failures, new users, avg basket)
 *   - Pipeline counts par status
 *   - Failures block HTML (vide si 0, populé sinon)
 *   - Multi-destinataires (Promise.all sur ADMIN_EMAILS)
 *   - Headline branching (failures > 0 / 0 orders / 1 / many)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      aggregate: vi.fn(async () => ({ _sum: { amountCents: 0 }, _count: { _all: 0 } })),
      groupBy: vi.fn(async () => []),
      findMany: vi.fn(async () => []),
    },
    user: {
      count: vi.fn(async () => 0),
    },
  },
}));

vi.mock('@/lib/emails/send', () => ({
  sendAdminDailySummaryEmail: vi.fn(async () => ({ sent: true })),
}));

import { prisma } from '@/lib/db';
import { sendAdminDailySummaryEmail } from '@/lib/emails/send';

const URL = 'http://localhost/api/cron/daily-summary';

function makeReq(headers: Record<string, string> = {}) {
  return new NextRequest(URL, { method: 'GET', headers });
}

function resetMocks() {
  // Clear call history AND reset implementation. mockResolvedValue queues
  // values per-test, so we wipe everything to avoid leakage.
  vi.clearAllMocks();
  vi.mocked(prisma.order.aggregate).mockResolvedValue({
    _sum: { amountCents: 0 },
    _count: { _all: 0 },
  } as never);
  vi.mocked(prisma.order.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.count).mockResolvedValue(0);
  vi.mocked(sendAdminDailySummaryEmail).mockResolvedValue({ sent: true } as never);
}

describe('/api/cron/daily-summary — auth gate', () => {
  beforeEach(() => {
    vi.resetModules();
    resetMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('401 si CRON_SECRET set et Authorization mismatch', async () => {
    vi.stubEnv('CRON_SECRET', 'sec');
    vi.stubEnv('ADMIN_EMAILS', 'admin@plio.ca');
    const { GET } = await import('@/app/api/cron/daily-summary/route');
    const res = await GET(makeReq({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(sendAdminDailySummaryEmail).not.toHaveBeenCalled();
  });

  it('503 si production sans CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_EMAILS', 'admin@plio.ca');
    const { GET } = await import('@/app/api/cron/daily-summary/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(503);
  });

  it('503 si ADMIN_EMAILS vide même avec auth OK', async () => {
    vi.stubEnv('CRON_SECRET', 'sec');
    vi.stubEnv('ADMIN_EMAILS', '');
    const { GET } = await import('@/app/api/cron/daily-summary/route');
    const res = await GET(makeReq({ authorization: 'Bearer sec' }));
    expect(res.status).toBe(503);
    const j = await res.json();
    expect(j.error).toMatch(/No ADMIN_EMAILS/);
  });

  it('200 si auth OK + ADMIN_EMAILS set', async () => {
    vi.stubEnv('CRON_SECRET', 'sec');
    vi.stubEnv('ADMIN_EMAILS', 'admin@plio.ca');
    const { GET } = await import('@/app/api/cron/daily-summary/route');
    const res = await GET(makeReq({ authorization: 'Bearer sec' }));
    expect(res.status).toBe(200);
  });
});

describe('/api/cron/daily-summary — KPIs + send', () => {
  beforeEach(() => {
    vi.resetModules();
    resetMocks();
    vi.stubEnv('CRON_SECRET', 'sec');
    vi.stubEnv('ADMIN_EMAILS', 'admin@plio.ca,ops@plio.ca');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('calcule revenue + orders count + avg basket depuis aggregate', async () => {
    vi.mocked(prisma.order.aggregate).mockResolvedValue({
      _sum: { amountCents: 56321 }, // 563,21 $
      _count: { _all: 3 },
    } as never);

    const { GET } = await import('@/app/api/cron/daily-summary/route');
    const res = await GET(makeReq({ authorization: 'Bearer sec' }));
    const j = await res.json();
    expect(j.kpis).toMatchObject({
      orders24h: 3,
      revenue24h: 563.21,
      failures24h: 0,
      newUsers: 0,
    });
    expect(j.kpis.avgBasket).toBeCloseTo(187.74, 2);
  });

  it('passe les vars formatées au send helper (revenu CAD fr-CA)', async () => {
    vi.mocked(prisma.order.aggregate).mockResolvedValue({
      _sum: { amountCents: 12345 },
      _count: { _all: 2 },
    } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(5);

    const { GET } = await import('@/app/api/cron/daily-summary/route');
    await GET(makeReq({ authorization: 'Bearer sec' }));

    expect(sendAdminDailySummaryEmail).toHaveBeenCalled();
    const args = vi.mocked(sendAdminDailySummaryEmail).mock.calls[0][0];
    expect(args.vars.REVENUE_24H).toBe('123,45');
    expect(args.vars.ORDERS_24H).toBe(2);
    expect(args.vars.NEW_USERS_24H).toBe(5);
    expect(args.vars.NEW_USERS_PLURAL).toBe('s');
    expect(args.vars.FAILURES_24H).toBe(0);
    expect(args.vars.FAILURES_COLOR).toBe('#4A554D');
    expect(args.vars.FAILURES_BLOCK_HTML).toBe('');
  });

  it('NEW_USERS_PLURAL = "" si exactement 1 nouvel user', async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(1);
    const { GET } = await import('@/app/api/cron/daily-summary/route');
    await GET(makeReq({ authorization: 'Bearer sec' }));
    const args = vi.mocked(sendAdminDailySummaryEmail).mock.calls[0][0];
    expect(args.vars.NEW_USERS_PLURAL).toBe('');
  });

  it('compute pipeline counts depuis groupBy', async () => {
    vi.mocked(prisma.order.groupBy).mockResolvedValue([
      { status: 'PAID', _count: { _all: 4 } },
      { status: 'SHIPPED', _count: { _all: 7 } },
      { status: 'FAILED', _count: { _all: 2 } },
      { status: 'CANCELLED', _count: { _all: 1 } },
    ] as never);

    const { GET } = await import('@/app/api/cron/daily-summary/route');
    await GET(makeReq({ authorization: 'Bearer sec' }));
    const args = vi.mocked(sendAdminDailySummaryEmail).mock.calls[0][0];
    expect(args.vars.COUNT_PAID).toBe(4);
    expect(args.vars.COUNT_SHIPPED).toBe(7);
    expect(args.vars.COUNT_FAILED).toBe(3); // FAILED + CANCELLED group
    expect(args.vars.COUNT_DELIVERED).toBe(0);
  });

  it('render failures block HTML + color rouge si failures > 0', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'order_abc123', sinaliteOrderId: '48312', amountCents: 18742, failureReason: 'Sinalite refusé : taille hors specs' },
      { id: 'order_def456', sinaliteOrderId: null, amountCents: 9999, failureReason: null },
    ] as never);

    const { GET } = await import('@/app/api/cron/daily-summary/route');
    await GET(makeReq({ authorization: 'Bearer sec' }));
    const args = vi.mocked(sendAdminDailySummaryEmail).mock.calls[0][0];
    expect(args.vars.FAILURES_24H).toBe(2);
    expect(args.vars.FAILURES_COLOR).toBe('#B83A2C');
    expect(args.vars.FAILURES_BLOCK_HTML).toContain('#SIN-48312');
    expect(args.vars.FAILURES_BLOCK_HTML).toContain('Sinalite refusé');
    expect(args.vars.FAILURES_BLOCK_HTML).toContain('187,42 $');
    // Fallback display id quand pas de sinaliteOrderId — slice(-6).toUpperCase()
    expect(args.vars.FAILURES_BLOCK_HTML).toContain('#DEF456');
  });

  it('headline reflète failures > 0 en priorité', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'x', sinaliteOrderId: null, amountCents: 100, failureReason: null },
    ] as never);
    vi.mocked(prisma.order.aggregate).mockResolvedValue({
      _sum: { amountCents: 10000 },
      _count: { _all: 5 },
    } as never);

    const { GET } = await import('@/app/api/cron/daily-summary/route');
    await GET(makeReq({ authorization: 'Bearer sec' }));
    const args = vi.mocked(sendAdminDailySummaryEmail).mock.calls[0][0];
    expect(args.vars.HEADLINE).toMatch(/échec/i);
  });

  it('headline "Journée tranquille" si 0 commandes 0 failures', async () => {
    const { GET } = await import('@/app/api/cron/daily-summary/route');
    await GET(makeReq({ authorization: 'Bearer sec' }));
    const args = vi.mocked(sendAdminDailySummaryEmail).mock.calls[0][0];
    expect(args.vars.HEADLINE).toMatch(/tranquille/i);
  });

  it('envoie à chaque ADMIN_EMAILS (multi-destinataires)', async () => {
    const { GET } = await import('@/app/api/cron/daily-summary/route');
    const res = await GET(makeReq({ authorization: 'Bearer sec' }));
    const j = await res.json();
    expect(sendAdminDailySummaryEmail).toHaveBeenCalledTimes(2);
    const tos = vi.mocked(sendAdminDailySummaryEmail).mock.calls.map((c) => c[0].to);
    expect(tos).toEqual(['admin@plio.ca', 'ops@plio.ca']);
    expect(j.recipients).toHaveLength(2);
  });

  it('marque sent=false dans recipients si queueEmail retourne sent=false', async () => {
    // First call fails (queued for retry), second succeeds — verifies per-recipient tracking
    vi.mocked(sendAdminDailySummaryEmail)
      .mockResolvedValueOnce({ sent: false, id: 'del_fail' } as never)
      .mockResolvedValueOnce({ sent: true, id: 'del_ok' } as never);
    const { GET } = await import('@/app/api/cron/daily-summary/route');
    const res = await GET(makeReq({ authorization: 'Bearer sec' }));
    const j = await res.json();
    expect(j.recipients[0].sent).toBe(false);
    expect(j.recipients[1].sent).toBe(true);
  });
});
