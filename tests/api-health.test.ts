/**
 * Tests pour GET /api/health — Round 26 #4 lock-in.
 *
 * L'endpoint est critique : monitoring externes (Better Stack, Pingdom,
 * Healthchecks.io) le pollent toutes les 1-5 min. Si la shape change
 * silencieusement, les dashboards monitoring cassent sans warning.
 *
 * Invariants lock-in :
 *   - 200 si tout pass
 *   - 503 si DB fail (critique)
 *   - 200 + status=warn si dépendance non-critique fail (Stripe, Sinalite, email, webhooks)
 *   - Réponse contient version + releaseId + timestamp + checks (IETF format)
 *   - Pas de stripe balance leaked (Round 14 #4 — defense in depth)
 *   - Cache-Control: no-store (les monitors ne doivent pas cacher)
 *   - Nouveau check webhooks:deadletter exposé (Round 26 #4)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Toutes les checks doivent être mockées. La structure du timed() helper
// nous force à mock les bases (prisma, Stripe ctor, fetch global).
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    emailDelivery: { count: vi.fn(async () => 0) },
    webhookEvent: {
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
    },
  },
}));

vi.mock('@/lib/webhooks/dead-letter', () => ({
  countDeadLetterWebhooks: vi.fn(async () => ({ total: 0, bySource: {} })),
}));

// Mock Stripe class — `new Stripe()` instances need `.balance.retrieve()`.
// Module-level state so tests can override stripeBalanceMock per test
// without breaking the `new Stripe(...)` constructor call at import time.
const stripeBalanceMock = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ available: [{ amount: 12345 }] }));
vi.mock('stripe', () => {
  class StripeMock {
    balance = { retrieve: (...args: unknown[]) => stripeBalanceMock(...args) };
  }
  return { default: StripeMock };
});

// Mock global fetch (used for Sinalite probe)
const originalFetch = global.fetch;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.SINALITE_API_BASE = 'https://api.sinalite.fake';
  process.env.SINALITE_AUTH_BASE = 'https://auth.sinalite.fake';
  process.env.SINALITE_CLIENT_ID = 'id';
  process.env.SINALITE_CLIENT_SECRET = 'secret';
  process.env.SINALITE_AUDIENCE = 'aud';
  // Default : both fetch calls (auth + product) succeed
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/auth/token')) {
      return new Response(JSON.stringify({ access_token: 'fake_token' }), { status: 200 });
    }
    if (url.includes('/product/1')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as never;
});

afterEach(() => {
  global.fetch = originalFetch;
});

import { afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { countDeadLetterWebhooks } from '@/lib/webhooks/dead-letter';

async function callHealth(): Promise<{ status: number; body: Record<string, unknown> }> {
  vi.resetModules();
  const { GET } = await import('@/app/api/health/route');
  const res = await GET();
  return { status: res.status, body: await res.json() };
}

describe('GET /api/health (Round 26 #4)', () => {
  it('200 + status=pass quand toutes les checks pass', async () => {
    const { status, body } = await callHealth();
    expect(status).toBe(200);
    expect(body.status).toBe('pass');
  });

  it('réponse contient les champs IETF (version, releaseId, timestamp, checks)', async () => {
    const { body } = await callHealth();
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('releaseId');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('checks');
    expect(body).toHaveProperty('totalLatencyMs');
  });

  it('checks inclut les 6 surfaces (lock-in la shape)', async () => {
    const { body } = await callHealth();
    const checks = body.checks as Record<string, unknown>;
    expect(checks).toHaveProperty('db:postgres');
    expect(checks).toHaveProperty('api:sinalite');
    expect(checks).toHaveProperty('api:stripe');
    expect(checks).toHaveProperty('email:queue');
    expect(checks).toHaveProperty('webhooks:recent');
    // Round 26 #4 nouvelle check
    expect(checks).toHaveProperty('webhooks:deadletter');
  });

  it('503 + status=fail si DB ping throw (CRITIQUE)', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('connection refused'));
    const { status, body } = await callHealth();
    expect(status).toBe(503);
    expect(body.status).toBe('fail');
  });

  it('200 + status=warn si Stripe fail (DEGRADED, non-critical)', async () => {
    stripeBalanceMock.mockRejectedValueOnce(new Error('Stripe API down'));
    const { status, body } = await callHealth();
    expect(status).toBe(200);
    expect(body.status).toBe('warn');
  });

  it('200 + status=warn si webhooks:deadletter au-dessus du seuil (>5)', async () => {
    vi.mocked(countDeadLetterWebhooks).mockResolvedValueOnce({
      total: 10,
      bySource: { STRIPE: 10 },
    });
    const { status, body } = await callHealth();
    expect(status).toBe(200);
    expect(body.status).toBe('warn');
    const checks = body.checks as Record<string, { status: string; error?: string }>;
    expect(checks['webhooks:deadletter']?.status).toBe('fail');
    expect(checks['webhooks:deadletter']?.error).toMatch(/10 webhook dead-letters/);
  });

  it('pas de stripe balance leaked dans la réponse (Round 14 #4 defense)', async () => {
    const { body } = await callHealth();
    const json = JSON.stringify(body);
    // 12345 est le montant mocké — ne doit JAMAIS apparaître dans la réponse
    expect(json).not.toContain('12345');
    expect(json).not.toContain('available');
  });

  it('Cache-Control no-store dans les headers', async () => {
    vi.resetModules();
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
  });
});
