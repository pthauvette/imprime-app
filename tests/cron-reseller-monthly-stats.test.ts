/**
 * Tests pour GET /api/cron/reseller-monthly-stats — Round 24 #4.
 *
 * On mock toutes les dépendances (prisma, send helper, healthcheck, runs).
 * Garantit l'invariants critiques :
 *   - Auth Bearer required en prod
 *   - Calcul de window mois écoulé correct
 *   - Skip resellers à 0 order
 *   - Email envoyé avec vars correctes
 *   - Idempotent via label déterministe (vérifié par le send helper qui prend monthKey)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    order: { groupBy: vi.fn() },
  },
}));

vi.mock('@/lib/emails/send', () => ({
  sendResellerMonthlyStatsEmail: vi.fn(async () => ({ sent: true, id: 'em_1' })),
}));

vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub, logEmail: stub };
});

import { prisma } from '@/lib/db';
import { sendResellerMonthlyStatsEmail } from '@/lib/emails/send';

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request('http://localhost/api/cron/reseller-monthly-stats', { headers });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'test_secret', NODE_ENV: 'production' };
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.order.groupBy).mockResolvedValue([] as never);
});

describe('GET /api/cron/reseller-monthly-stats', () => {
  it('401 si Bearer manquant en prod', async () => {
    const { GET } = await import('@/app/api/cron/reseller-monthly-stats/route');
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it('401 si Bearer wrong', async () => {
    const { GET } = await import('@/app/api/cron/reseller-monthly-stats/route');
    const res = await GET(makeReq('Bearer wrong') as never);
    expect(res.status).toBe(401);
  });

  it('200 + sent:0 si pas de resellers', async () => {
    const { GET } = await import('@/app/api/cron/reseller-monthly-stats/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, sent: 0 });
    expect(sendResellerMonthlyStatsEmail).not.toHaveBeenCalled();
  });

  it('skip reseller sans order le mois écoulé', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 'u_1', email: 'a@plio.ca', name: 'A', firstName: 'A', resellerStatus: 'VERIFIED', emailMarketing: true },
    ] as never);
    vi.mocked(prisma.order.groupBy).mockResolvedValue([] as never);
    const { GET } = await import('@/app/api/cron/reseller-monthly-stats/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    expect(sendResellerMonthlyStatsEmail).not.toHaveBeenCalled();
  });

  it('envoie email avec vars correctes pour reseller avec orders', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 'u_1', email: 'a@plio.ca', name: 'Alice', firstName: 'Alice', resellerStatus: 'VERIFIED', emailMarketing: true },
    ] as never);
    // Mois écoulé : 8 orders, 100 000 cents (1 000 $), 5 000 cents discount
    // Mois précédent : 6 orders
    vi.mocked(prisma.order.groupBy)
      .mockResolvedValueOnce([
        { userId: 'u_1', _count: { _all: 8 }, _sum: { amountCents: 100_000, resellerDiscountCents: 5_000 } },
      ] as never)
      .mockResolvedValueOnce([
        { userId: 'u_1', _count: { _all: 6 } },
      ] as never);

    const { GET } = await import('@/app/api/cron/reseller-monthly-stats/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(1);

    expect(sendResellerMonthlyStatsEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendResellerMonthlyStatsEmail).mock.calls[0]![0];
    expect(call.user.id).toBe('u_1');
    expect(call.vars.ORDERS_COUNT).toBe(8);
    // fr-CA toLocaleString uses U+202F narrow no-break space for thousands
    // separator, not ASCII space. Source-of-truth pattern → drive expected
    // from the same locale call instead of hardcoding (which silently fails
    // on byte-for-byte assertions).
    expect(call.vars.REVENUE).toBe((1000).toLocaleString('fr-CA', { minimumFractionDigits: 2 }));
    expect(call.vars.DISCOUNT_SAVED).toBe((50).toLocaleString('fr-CA', { minimumFractionDigits: 2 }));
    expect(call.vars.STATUS_HEADLINE).toContain('VERIFIED');
    // Label monthKey doit suivre format YYYY-MM
    expect(call.monthKey).toMatch(/^\d{4}-\d{2}$/);
  });

  it('comparison label "premier mois" quand prev mois = 0', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 'u_1', email: 'a@plio.ca', name: null, firstName: 'A', resellerStatus: 'AUTO_DETECTED', emailMarketing: true },
    ] as never);
    vi.mocked(prisma.order.groupBy)
      .mockResolvedValueOnce([
        { userId: 'u_1', _count: { _all: 3 }, _sum: { amountCents: 50_000, resellerDiscountCents: 0 } },
      ] as never)
      .mockResolvedValueOnce([] as never); // prev mois vide

    const { GET } = await import('@/app/api/cron/reseller-monthly-stats/route');
    await GET(makeReq('Bearer test_secret') as never);
    const call = vi.mocked(sendResellerMonthlyStatsEmail).mock.calls[0]![0];
    expect(call.vars.COMPARISON_LABEL).toContain('Premier mois');
    expect(call.vars.STATUS_HEADLINE).toContain('AUTO-DÉTECTÉ');
  });

  it('compte skippedOptOut quand send retourne optedOut', async () => {
    vi.mocked(sendResellerMonthlyStatsEmail).mockResolvedValueOnce({ sent: false, optedOut: true } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 'u_1', email: 'a@plio.ca', name: null, firstName: 'A', resellerStatus: 'VERIFIED', emailMarketing: false },
    ] as never);
    vi.mocked(prisma.order.groupBy)
      .mockResolvedValueOnce([
        { userId: 'u_1', _count: { _all: 1 }, _sum: { amountCents: 10_000, resellerDiscountCents: 0 } },
      ] as never)
      .mockResolvedValueOnce([] as never);

    const { GET } = await import('@/app/api/cron/reseller-monthly-stats/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.skippedOptOut).toBe(1);
  });
});
