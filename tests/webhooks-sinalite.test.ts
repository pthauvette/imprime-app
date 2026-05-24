/**
 * Tests pour POST /api/webhooks/sinalite — status update callback.
 *
 * Couvre : signature, validation payload, idempotence via fingerprint,
 * dispatch d'emails par status (SHIPPED/DELIVERED/CANCELLED),
 * OrderNotFoundError handling, statut non-email qui populate quand même
 * orderId pour l'outcome row.
 *
 * Note signature : le route lit SINALITE_WEBHOOK_SECRET au load — on stub
 * via vi.stubEnv + vi.resetModules pour tester les deux paths (set vs unset).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Order, User } from '@prisma/client';

// ─── Mocks (factories hoisted) ──────────────────────────────────────────────
vi.mock('@/lib/db/orders', async () => {
  class OrderNotFoundError extends Error {
    constructor(key: string) {
      super(`Order not found: ${key}`);
      this.name = 'OrderNotFoundError';
    }
  }
  return {
    applySinaliteStatusChange: vi.fn(async () => undefined),
    recordWebhookEvent: vi.fn(async () => ({ isNew: true })),
    updateWebhookOutcome: vi.fn(async () => undefined),
    OrderNotFoundError,
  };
});

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/emails/send', () => ({
  sendOrderShippedEmail: vi.fn(async () => ({ sent: true, id: 'del_1' })),
  sendOrderDeliveredEmail: vi.fn(async () => ({ sent: true, id: 'del_2' })),
  sendOrderCancelledEmail: vi.fn(async () => ({ sent: true, id: 'del_3' })),
  sendReviewRequestEmail: vi.fn(async () => ({ sent: true, id: 'del_4' })),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = {
    info: noop, warn: noop, error: noop, fatal: noop, debug: noop, trace: noop,
    child: () => stub,
  };
  return {
    log: stub,
    logStripe: stub,
    logSinalite: stub,
    logAuth: stub,
    logEmail: stub,
    logS3: stub,
    logAdmin: stub,
    logWebhook: stub,
  };
});

// ─── Imports SUT after mocks (with SECRET unset at module load) ─────────────
// The setup file injects test env vars but not SINALITE_WEBHOOK_SECRET, so by
// default the module reads `WEBHOOK_SECRET = undefined` → no signature check.
// We test the "secret set" path separately via resetModules + stubEnv.
import * as orders from '@/lib/db/orders';
import { prisma } from '@/lib/db';
import * as emails from '@/lib/emails/send';
import { makeTestUser } from './factories/user';
import { makeTestOrder } from './factories/order';

// ─── Fixtures ────────────────────────────────────────────────────────────────
// Round 19 #1 — factory remplace inline fixture.
const baseUser: User = makeTestUser({
  id: 'user_1',
  email: 'buyer@plio.ca',
  name: 'Buyer One',
  firstName: 'Buyer',
  lastName: 'One',
});

// Round 21 #1 — factory replace inline fixture
const baseOrder: Order = makeTestOrder({ id: 'order_db_1', userId: 'user_1', status: 'SUBMITTED' });

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/webhooks/sinalite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// Timestamp dynamique : la route rejette > 1h dans le passé pour bloquer
// les replay attacks. Tests doivent utiliser un timestamp récent.
const validPayload = (overrides: Record<string, unknown> = {}) => ({
  orderId: 48312,
  status: 'SHIPPED',
  timestamp: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(orders.recordWebhookEvent).mockResolvedValue({ isNew: true });
  vi.mocked(orders.applySinaliteStatusChange).mockResolvedValue(undefined as never);
  vi.mocked(orders.updateWebhookOutcome).mockResolvedValue(undefined);
});

// ─── J. Signature validation (secret SET path) ──────────────────────────────
describe('J. Signature validation when SINALITE_WEBHOOK_SECRET is set', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns 401 when x-sinalite-signature mismatches the secret', async () => {
    vi.resetModules();
    vi.stubEnv('SINALITE_WEBHOOK_SECRET', 'shhh-correct-secret');

    // Re-import after env stub so module reads the secret at load.
    const { POST } = await import('@/app/api/webhooks/sinalite/route');

    const res = await POST(
      makeReq(validPayload(), { 'x-sinalite-signature': 'wrong-secret' }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid signature' });
    expect(orders.recordWebhookEvent).not.toHaveBeenCalled();
  });

  it('accepts the request when signature matches the secret', async () => {
    vi.resetModules();
    vi.stubEnv('SINALITE_WEBHOOK_SECRET', 'shhh-correct-secret');
    const { POST } = await import('@/app/api/webhooks/sinalite/route');

    // After resetModules, get fresh mock references for the same module
    // identity used by the route. Vitest preserves vi.mock across resets.
    const ordersAfter = await import('@/lib/db/orders');
    const { prisma: prismaAfter } = await import('@/lib/db');
    vi.mocked(ordersAfter.recordWebhookEvent).mockResolvedValue({ isNew: true });
    vi.mocked(ordersAfter.applySinaliteStatusChange).mockResolvedValue(undefined as never);
    vi.mocked(ordersAfter.updateWebhookOutcome).mockResolvedValue(undefined);
    vi.mocked(prismaAfter.order.findUnique).mockResolvedValue(
      { ...baseOrder, user: baseUser } as never,
    );

    const res = await POST(
      makeReq(validPayload({ status: 'IN_PRODUCTION' }), {
        'x-sinalite-signature': 'shhh-correct-secret',
      }),
    );

    expect(res.status).toBe(200);
  });
});

// ─── K. Invalid payload ─────────────────────────────────────────────────────
describe('K. Invalid payload', () => {
  it('returns 400 on garbage JSON / failed zod parse', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    const res = await POST(makeReq({ totally: 'wrong shape' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid payload' });
    expect(orders.recordWebhookEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not valid JSON', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    const res = await POST(makeReq('not even json{{{'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid payload' });
  });
});

// ─── L. Idempotence via fingerprint ─────────────────────────────────────────
describe('L. Idempotence via fingerprint', () => {
  it('short-circuits with deduped=true when fingerprint already seen', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    vi.mocked(orders.recordWebhookEvent).mockResolvedValueOnce({ isNew: false });

    const res = await POST(makeReq(validPayload()));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, deduped: true });
    expect(orders.applySinaliteStatusChange).not.toHaveBeenCalled();
    expect(emails.sendOrderShippedEmail).not.toHaveBeenCalled();
    expect(orders.updateWebhookOutcome).not.toHaveBeenCalled();
  });

  it('builds fingerprint as orderId:status:timestamp', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      { ...baseOrder, user: baseUser } as never,
    );
    // Round 36 #2 — MAX_TIMESTAMP_AGE_MS shrunk from 1h to 5min. Test
    // utilisait -10min ce qui dépasse maintenant. Use -2 min (inside window).
    const ts = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await POST(makeReq(validPayload({ orderId: 7, status: 'IN_PRODUCTION', timestamp: ts })));
    expect(orders.recordWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'SINALITE',
        eventId: `7:IN_PRODUCTION:${ts}`,
        eventType: 'IN_PRODUCTION',
        payload: expect.any(String),
      }),
    );
  });
});

// ─── M. SHIPPED ─────────────────────────────────────────────────────────────
describe('M. status=SHIPPED', () => {
  it('applies status change, sends shipped email with tracking+carrier, updates outcome', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { ...baseOrder, user: baseUser } as never,
    );

    const res = await POST(
      makeReq(validPayload({ status: 'SHIPPED', trackingNumber: '1Z9999', carrier: 'UPS' })),
    );

    expect(orders.applySinaliteStatusChange).toHaveBeenCalledWith({
      sinaliteOrderId: 48312,
      status: 'SHIPPED',
      data: expect.objectContaining({ orderId: 48312, status: 'SHIPPED' }),
    });
    expect(emails.sendOrderShippedEmail).toHaveBeenCalledWith({
      order: expect.objectContaining({ id: baseOrder.id }),
      user: baseUser,
      trackingNumber: '1Z9999',
      carrier: 'UPS',
    });
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'SINALITE',
        success: true,
        statusCode: 200,
        orderId: baseOrder.id,
      }),
    );
    expect(res.status).toBe(200);
  });
});

// ─── N. DELIVERED ───────────────────────────────────────────────────────────
describe('N. status=DELIVERED', () => {
  it('sends delivered email with deliveredAt parsed from payload.timestamp', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { ...baseOrder, user: baseUser } as never,
    );

    const ts = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // -5min, fresh
    const res = await POST(makeReq(validPayload({ status: 'DELIVERED', timestamp: ts })));

    expect(emails.sendOrderDeliveredEmail).toHaveBeenCalledWith({
      order: expect.objectContaining({ id: baseOrder.id }),
      user: baseUser,
      deliveredAt: new Date(ts),
    });
    expect(res.status).toBe(200);
  });
});

// ─── O. CANCELLED ───────────────────────────────────────────────────────────
describe('O. status=CANCELLED', () => {
  it('uses payload.notes as cancellation reason when provided', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { ...baseOrder, user: baseUser } as never,
    );

    const res = await POST(
      makeReq(validPayload({ status: 'CANCELLED', notes: 'Hors stock production' })),
    );

    expect(emails.sendOrderCancelledEmail).toHaveBeenCalledWith({
      order: expect.objectContaining({ id: baseOrder.id }),
      user: baseUser,
      reason: 'Hors stock production',
      refundAmountCents: baseOrder.amountCents,
    });
    expect(res.status).toBe(200);
  });

  it('falls back to "Annulation par Sinalite" when notes is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { ...baseOrder, user: baseUser } as never,
    );

    await POST(makeReq(validPayload({ status: 'CANCELLED' })));

    expect(emails.sendOrderCancelledEmail).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Annulation par Sinalite' }),
    );
  });
});

// ─── P. OrderNotFoundError on applySinaliteStatusChange ─────────────────────
describe('P. OrderNotFoundError → unknown:true', () => {
  it('returns 200 unknown=true and skips emails', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    vi.mocked(orders.applySinaliteStatusChange).mockRejectedValueOnce(
      new orders.OrderNotFoundError('sinalite=99999'),
    );

    const res = await POST(makeReq(validPayload({ orderId: 99999, status: 'SHIPPED' })));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, unknown: true });
    expect(emails.sendOrderShippedEmail).not.toHaveBeenCalled();
    expect(emails.sendOrderDeliveredEmail).not.toHaveBeenCalled();
    expect(emails.sendOrderCancelledEmail).not.toHaveBeenCalled();
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, statusCode: 200 }),
    );
  });
});

// ─── Q. IN_PRODUCTION (no email) — but orderId still set for outcome ────────
describe('Q. status=IN_PRODUCTION (no email needed)', () => {
  it('calls applySinaliteStatusChange + populates dbOrderId via secondary findUnique', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    // The "no email" branch uses findUnique with select: { id: true }
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { id: baseOrder.id } as never,
    );

    const res = await POST(makeReq(validPayload({ status: 'IN_PRODUCTION' })));

    expect(orders.applySinaliteStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ sinaliteOrderId: 48312, status: 'IN_PRODUCTION' }),
    );
    expect(emails.sendOrderShippedEmail).not.toHaveBeenCalled();
    expect(emails.sendOrderDeliveredEmail).not.toHaveBeenCalled();
    expect(emails.sendOrderCancelledEmail).not.toHaveBeenCalled();
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'SINALITE',
        success: true,
        statusCode: 200,
        orderId: baseOrder.id,
      }),
    );
    expect(res.status).toBe(200);
  });
});

// ─── Bonus: handler-level failure (applySinaliteStatusChange throws non-OrderNotFound) ──
describe('R. Unexpected error in applySinaliteStatusChange', () => {
  it('returns 500 and records outcome success=false', async () => {
    const { POST } = await import('@/app/api/webhooks/sinalite/route');
    vi.mocked(orders.applySinaliteStatusChange).mockRejectedValueOnce(new Error('db boom'));

    const res = await POST(makeReq(validPayload({ status: 'SHIPPED' })));

    expect(res.status).toBe(500);
    expect(orders.updateWebhookOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, statusCode: 500 }),
    );
  });
});
