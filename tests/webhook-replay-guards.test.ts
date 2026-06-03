/**
 * Tests des protections replay-attack sur les webhooks Stripe + Sinalite.
 *
 * Stripe : on s'appuie sur constructEvent qui throw "Timestamp outside
 *   the tolerance zone" — on simule en mockant Stripe.webhooks. On vérifie
 *   que le route handler retourne 400 + log replayAttempt=true.
 *
 * Sinalite : timestamp dans le payload est validé contre l'heure courante
 *   avec MAX_TIMESTAMP_AGE_MS (1h) + clock skew futur (5min). On vérifie
 *   qu'un payload vieux > 1h est rejeté, qu'un payload < 1h est accepté.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    webhookEvent: { create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@/lib/db/orders', () => ({
  recordWebhookEvent: vi.fn(async () => ({ isNew: true, alreadyCompleted: false })),
  updateWebhookOutcome: vi.fn(async () => {}),
}));

vi.mock('@/lib/webhooks/sinalite-process', async () => {
  const z = await import('zod');
  const { OrderStatus } = await import('@/lib/sinalite/types');
  return {
    processSinaliteEvent: vi.fn(async () => {}),
    SinaliteWebhookPayload: z.object({
      orderId: z.number(),
      status: OrderStatus,
      timestamp: z.string(),
      trackingNumber: z.string().optional(),
      carrier: z.string().optional(),
    }),
  };
});

vi.mock('@/lib/webhooks/stripe-process', () => ({
  processStripeEvent: vi.fn(async () => {}),
}));

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => {}),
}));

vi.mock('stripe', () => {
  const constructEvent = vi.fn();
  class StripeMock {
    webhooks = { constructEvent };
    refunds = { create: vi.fn() };
  }
  return { default: StripeMock };
});

import Stripe from 'stripe';

async function importStripeRoute() {
  vi.resetModules();
  return (await import('@/app/api/webhooks/stripe/route')).POST;
}

async function importSinaliteRoute() {
  vi.resetModules();
  return (await import('@/app/api/webhooks/sinalite/route')).POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_x');
  vi.unstubAllEnvs?.();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_x');
});

describe('Stripe webhook : replay guard', () => {
  it('rejette 400 si constructEvent throw avec "timestamp"', async () => {
    const POST = await importStripeRoute();
    const stripeInstance = new (Stripe as unknown as new () => { webhooks: { constructEvent: ReturnType<typeof vi.fn> } })();
    stripeInstance.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error('Timestamp outside the tolerance zone');
    });

    const res = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=stale,v1=sig' },
        body: '{}',
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Stale webhook/);
  });

  it('rejette 400 si constructEvent throw avec autre message (invalid sig)', async () => {
    const POST = await importStripeRoute();
    const stripeInstance = new (Stripe as unknown as new () => { webhooks: { constructEvent: ReturnType<typeof vi.fn> } })();
    stripeInstance.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error('No signatures found matching expected signature');
    });

    const res = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=now,v1=bad' },
        body: '{}',
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid signature/);
  });

  it('400 si pas de stripe-signature header', async () => {
    const POST = await importStripeRoute();
    const res = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('Sinalite webhook : replay guard via timestamp freshness', () => {
  beforeEach(() => {
    vi.stubEnv('SINALITE_WEBHOOK_SECRET', 'shh');
  });

  function makeReq(payload: object): Request {
    return new Request('http://localhost/api/webhooks/sinalite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sinalite-signature': 'shh',
      },
      body: JSON.stringify(payload),
    });
  }

  it('accepte un payload avec timestamp récent (< 1h)', async () => {
    const POST = await importSinaliteRoute();
    const recent = new Date(Date.now() - 30 * 1000).toISOString(); // -30s
    const res = await POST(
      makeReq({ orderId: 1, status: 'SHIPPED', timestamp: recent }),
    );
    expect(res.status).toBe(200);
  });

  it('rejette 400 si timestamp > 1h dans le passé (replay attack)', async () => {
    const POST = await importSinaliteRoute();
    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // -2h
    const res = await POST(
      makeReq({ orderId: 1, status: 'SHIPPED', timestamp: stale }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Stale webhook/);
  });

  it('rejette 400 si timestamp invalide (parse fail)', async () => {
    const POST = await importSinaliteRoute();
    const res = await POST(
      makeReq({ orderId: 1, status: 'SHIPPED', timestamp: 'not-a-date' }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid timestamp/);
  });

  it('rejette 400 si timestamp > 5min dans le futur (clock skew abus)', async () => {
    const POST = await importSinaliteRoute();
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // +10min
    const res = await POST(
      makeReq({ orderId: 1, status: 'SHIPPED', timestamp: future }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid timestamp/);
  });

  it('accepte un payload avec timestamp slightly future (< 5min clock skew)', async () => {
    const POST = await importSinaliteRoute();
    const slightlyFuture = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // +2min
    const res = await POST(
      makeReq({ orderId: 1, status: 'SHIPPED', timestamp: slightlyFuture }),
    );
    expect(res.status).toBe(200);
  });

  it('rejette 401 si secret invalide (signature check avant timestamp)', async () => {
    const POST = await importSinaliteRoute();
    const recent = new Date().toISOString();
    const res = await POST(
      new Request('http://localhost/api/webhooks/sinalite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sinalite-signature': 'wrong-secret',
        },
        body: JSON.stringify({ orderId: 1, status: 'SHIPPED', timestamp: recent }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
