/**
 * Tests GET /api/cron/pipeda-sla-alerts — Round 39 #3.
 *
 * Lock-in : warn ≥25j, critical ≥30j (PIPEDA SLA), Slack alert si critical,
 * email to each admin via allSettled (pas all-fail si 1 admin email fail).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    deleteAccountRequest: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true, id: 'em' })),
}));
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert: vi.fn(async () => true) }));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { prisma } from '@/lib/db';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { sendCriticalAlert } from '@/lib/alerting/slack';

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request('http://localhost/api/cron/pipeda-sla-alerts', { headers });
}

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  process.env = {
    ...ORIG_ENV,
    CRON_SECRET: 'test_secret',
    NODE_ENV: 'production',
    ADMIN_EMAILS: 'a1@plio.ca, a2@plio.ca',
  };
  vi.mocked(prisma.deleteAccountRequest.findMany).mockResolvedValue([] as never);
  vi.mocked(sendAdminCustomMessageEmail).mockResolvedValue({ sent: true, id: 'em' } as never);
});

describe('GET /api/cron/pipeda-sla-alerts (Round 39 #3)', () => {
  it('401 si Bearer manquant', async () => {
    const { GET } = await import('@/app/api/cron/pipeda-sla-alerts/route');
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it('skip si ADMIN_EMAILS missing', async () => {
    delete process.env.ADMIN_EMAILS;
    const { GET } = await import('@/app/api/cron/pipeda-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe('admin_emails_not_configured');
  });

  it('zero pending → skip email, ping healthcheck OK', async () => {
    const { GET } = await import('@/app/api/cron/pipeda-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.warned).toBe(0);
    expect(json.critical).toBe(0);
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('warning only (25-29j) → email envoyé, PAS de Slack critical', async () => {
    const ageDays = 27;
    vi.mocked(prisma.deleteAccountRequest.findMany).mockResolvedValue([
      {
        id: 'dr_warn',
        userId: 'u1',
        emailSnapshot: 'user@plio.ca',
        reason: null,
        createdAt: new Date(Date.now() - ageDays * 24 * 3600 * 1000),
      },
    ] as never);
    const { GET } = await import('@/app/api/cron/pipeda-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.warned).toBe(1);
    expect(json.critical).toBe(0);
    expect(sendAdminCustomMessageEmail).toHaveBeenCalledTimes(2); // 2 admins
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('critical (≥30j) → email + Slack critical alert', async () => {
    vi.mocked(prisma.deleteAccountRequest.findMany).mockResolvedValue([
      {
        id: 'dr_crit',
        userId: 'u2',
        emailSnapshot: 'late@plio.ca',
        reason: 'Move to competitor',
        createdAt: new Date(Date.now() - 35 * 24 * 3600 * 1000),
      },
    ] as never);
    const { GET } = await import('@/app/api/cron/pipeda-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.critical).toBe(1);
    expect(sendCriticalAlert).toHaveBeenCalledOnce();
    const alertArgs = vi.mocked(sendCriticalAlert).mock.calls[0]![0];
    expect(alertArgs.severity).toBe('critical');
    expect(alertArgs.title).toMatch(/PIPEDA/i);
  });

  it('allSettled : 1 email fail ≠ tout fail', async () => {
    vi.mocked(prisma.deleteAccountRequest.findMany).mockResolvedValue([
      {
        id: 'dr1', userId: 'u3', emailSnapshot: 'u@p.ca', reason: null,
        createdAt: new Date(Date.now() - 26 * 24 * 3600 * 1000),
      },
    ] as never);
    vi.mocked(sendAdminCustomMessageEmail)
      .mockRejectedValueOnce(new Error('SES bounce'))
      .mockResolvedValueOnce({ sent: true, id: 'em_2' } as never);
    const { GET } = await import('@/app/api/cron/pipeda-sla-alerts/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.recipients).toBe(2);
    expect(json.sent).toBe(1);
  });

  it('findMany WHERE status=PENDING AND createdAt < warnCutoff', async () => {
    const { GET } = await import('@/app/api/cron/pipeda-sla-alerts/route');
    await GET(makeReq('Bearer test_secret') as never);
    const args = vi.mocked(prisma.deleteAccountRequest.findMany).mock.calls[0]![0];
    expect(args?.where).toMatchObject({ status: 'PENDING' });
    const lt = (args?.where as { createdAt?: { lt: Date } } | undefined)?.createdAt?.lt;
    expect(lt).toBeInstanceOf(Date);
    // warnCutoff = now - 25j ± 60s margin
    const expectedMs = Date.now() - 25 * 24 * 3600 * 1000;
    expect(Math.abs(lt!.getTime() - expectedMs)).toBeLessThan(60_000);
  });
});
