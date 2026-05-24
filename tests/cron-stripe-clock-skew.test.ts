/**
 * Tests pour GET /api/cron/stripe-clock-skew — Round 27 #4.
 *
 * Invariants :
 *   - Auth Bearer required en prod
 *   - Skip si STRIPE_SECRET_KEY missing (sans crasher)
 *   - Compute drift = |local now - Stripe response Date|
 *   - Alerte Slack si drift > 120s
 *   - Pas d'alerte si drift petit
 *   - Fail gracieusement si Stripe API down ou Date header malformé
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert: vi.fn(async () => true) }));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub };
});

import { sendCriticalAlert } from '@/lib/alerting/slack';

function makeReq(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request('http://localhost/api/cron/stripe-clock-skew', { headers });
}

const ORIG_ENV = { ...process.env };
const ORIG_FETCH = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
  process.env = { ...ORIG_ENV, CRON_SECRET: 'test_secret', NODE_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_fake' };
});

afterEach(() => {
  global.fetch = ORIG_FETCH;
});

function mockStripeResponse(dateHeader: string | null, status = 200) {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({}), {
    status,
    headers: dateHeader ? { date: dateHeader } : {},
  })) as never;
}

describe('GET /api/cron/stripe-clock-skew (Round 27 #4)', () => {
  it('401 si Bearer manquant en prod', async () => {
    const { GET } = await import('@/app/api/cron/stripe-clock-skew/route');
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it('401 si Bearer wrong', async () => {
    const { GET } = await import('@/app/api/cron/stripe-clock-skew/route');
    const res = await GET(makeReq('Bearer wrong') as never);
    expect(res.status).toBe(401);
  });

  it('skipped si STRIPE_SECRET_KEY missing (pas de crash)', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { GET } = await import('@/app/api/cron/stripe-clock-skew/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, skipped: 'stripe_not_configured' });
  });

  it('200 + driftMs proche de 0 si horloges sync', async () => {
    // Stripe Date header = now() → drift ≈ 0
    mockStripeResponse(new Date().toUTCString());
    const { GET } = await import('@/app/api/cron/stripe-clock-skew/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.driftMs).toBeLessThan(5000); // < 5s tolerance pour le test runtime
    expect(json.alerted).toBe(false);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('alerte si drift > 120s', async () => {
    // Stripe Date = 3 minutes dans le passé
    const stripeTime = new Date(Date.now() - 180 * 1000).toUTCString();
    mockStripeResponse(stripeTime);
    const { GET } = await import('@/app/api/cron/stripe-clock-skew/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.driftSec).toBeGreaterThanOrEqual(120);
    expect(json.alerted).toBe(true);
    expect(sendCriticalAlert).toHaveBeenCalledOnce();
    const call = vi.mocked(sendCriticalAlert).mock.calls[0]![0];
    expect(call.severity).toBe('critical');
    expect(call.title).toMatch(/Clock skew/);
    expect(call.title).toMatch(/\d+s/);
  });

  it('pas d\'alerte si drift exactement au seuil (120s) — strictly > only', async () => {
    // Drift = 119s (juste sous le threshold)
    const stripeTime = new Date(Date.now() - 119 * 1000).toUTCString();
    mockStripeResponse(stripeTime);
    const { GET } = await import('@/app/api/cron/stripe-clock-skew/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    const json = await res.json();
    expect(json.alerted).toBe(false);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('500 si Stripe API HTTP non-200', async () => {
    mockStripeResponse(new Date().toUTCString(), 503);
    const { GET } = await import('@/app/api/cron/stripe-clock-skew/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/HTTP 503/);
  });

  it('500 si Date header manquant', async () => {
    mockStripeResponse(null);
    const { GET } = await import('@/app/api/cron/stripe-clock-skew/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/Date header/);
  });

  it('500 si Date header unparseable', async () => {
    mockStripeResponse('not a real date');
    const { GET } = await import('@/app/api/cron/stripe-clock-skew/route');
    const res = await GET(makeReq('Bearer test_secret') as never);
    expect(res.status).toBe(500);
  });
});
