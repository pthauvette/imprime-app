/**
 * Tests pour GET /api/cron/admin-weekly-digest — Round 29 #4.
 *
 * Lock-in :
 *   - Auth Bearer requise en prod
 *   - skip si ADMIN_EMAILS missing
 *   - 5 KPI queries en parallèle + top-3 customers
 *   - week-over-week delta computé correctement
 *   - sendAdminCustomMessageEmail appelé pour chaque admin email
 *   - Fail-soft per-recipient : 1 send fail ne casse pas les autres
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { aggregate: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true, id: 'em_1' })),
}));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub, logEmail: stub };
});

import { prisma } from '@/lib/db';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request('http://localhost/api/cron/admin-weekly-digest', { headers });
}

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  process.env = {
    ...ORIG_ENV,
    CRON_SECRET: 'test_secret',
    NODE_ENV: 'production',
    ADMIN_EMAILS: 'admin1@plio.ca, admin2@plio.ca',
  };
  // Defaults: zero data
  vi.mocked(prisma.order.aggregate).mockResolvedValue({ _sum: { amountCents: 0 } } as never);
  vi.mocked(prisma.order.count).mockResolvedValue(0);
  vi.mocked(prisma.order.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(sendAdminCustomMessageEmail).mockResolvedValue({ sent: true, id: 'em' } as never);
});

describe('GET /api/cron/admin-weekly-digest (Round 29 #4)', () => {
  it('401 si Bearer manquant en prod', async () => {
    const { GET } = await import('@/app/api/cron/admin-weekly-digest/route');
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it('skipped si ADMIN_EMAILS missing', async () => {
    delete process.env.ADMIN_EMAILS;
    const { GET } = await import('@/app/api/cron/admin-weekly-digest/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, skipped: 'admin_emails_not_configured' });
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
  });

  it('200 + envoie aux 2 admins parsed', async () => {
    const { GET } = await import('@/app/api/cron/admin-weekly-digest/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recipients).toBe(2);
    expect(json.sent).toBe(2);
    expect(sendAdminCustomMessageEmail).toHaveBeenCalledTimes(2);
    const tos = vi.mocked(sendAdminCustomMessageEmail).mock.calls.map((c) => c[0].to);
    expect(tos).toEqual(['admin1@plio.ca', 'admin2@plio.ca']);
  });

  it('BODY_HTML inclut chiffres clés + top customers', async () => {
    vi.mocked(prisma.order.aggregate)
      .mockResolvedValueOnce({ _sum: { amountCents: 250_000 } } as never) // this week revenue
      .mockResolvedValueOnce({ _sum: { amountCents: 200_000 } } as never); // last week revenue
    vi.mocked(prisma.order.count)
      .mockResolvedValueOnce(15)   // this week orders
      .mockResolvedValueOnce(12)   // last week orders
      .mockResolvedValueOnce(0)    // failures this week
      .mockResolvedValueOnce(3);   // pending action
    vi.mocked(prisma.order.groupBy).mockResolvedValueOnce([
      { userId: 'u1', _sum: { amountCents: 100_000 } },
      { userId: 'u2', _sum: { amountCents: 80_000 } },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 'u1', email: 'top@plio.ca', firstName: 'Top', name: 'Top User' },
      { id: 'u2', email: 'second@plio.ca', firstName: 'Second', name: 'Second User' },
    ] as never);

    const { GET } = await import('@/app/api/cron/admin-weekly-digest/route');
    await GET(makeReq('Bearer test_secret') as never);

    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0]![0];
    expect(args.vars.SUBJECT).toMatch(/Récap hebdo Plio/);
    expect(args.vars.PREVIEW).toMatch(/15 commandes/);
    expect(args.vars.BODY_HTML).toContain('Top'); // first name
    expect(args.vars.BODY_HTML).toContain('Second');
    // Week-over-week delta should appear
    expect(args.vars.BODY_HTML).toMatch(/\+\d+ %/); // revenue +25%, orders +25%
  });

  it('top customers vide → "Aucun customer" copy', async () => {
    const { GET } = await import('@/app/api/cron/admin-weekly-digest/route');
    await GET(makeReq('Bearer test_secret') as never);
    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0]![0];
    expect(args.vars.BODY_HTML).toContain('Aucun customer');
  });

  it('fail-soft per-recipient : si 1 send throw, count quand même les success', async () => {
    vi.mocked(sendAdminCustomMessageEmail)
      .mockRejectedValueOnce(new Error('SES bounce'))
      .mockResolvedValueOnce({ sent: true, id: 'em_2' } as never);

    const { GET } = await import('@/app/api/cron/admin-weekly-digest/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.recipients).toBe(2);
    expect(json.sent).toBe(1);
  });

  it('500 si une query DB throw → recordCronRun fail', async () => {
    vi.mocked(prisma.order.aggregate).mockRejectedValueOnce(new Error('DB down'));
    const { GET } = await import('@/app/api/cron/admin-weekly-digest/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(500);
  });
});
