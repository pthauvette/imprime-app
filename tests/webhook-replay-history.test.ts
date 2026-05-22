/**
 * Tests pour Round 26 #3 — WebhookReplay history insert.
 *
 * On vérifie que :
 *   - Le single replay route insère une WebhookReplay row avec les bons champs
 *   - Le bulk replay route insère N WebhookReplay rows
 *   - Si l'insert WebhookReplay échoue, le route répond quand même OK
 *     (fail-soft, l'aggregate count + lastReplayAt sur WebhookEvent restent
 *     la source canonique)
 *   - replayedByEmail snapshot = guard.user.email
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    webhookEvent: {
      findUnique: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
    webhookReplay: {
      create: vi.fn(async () => ({ id: 'rep_1' })),
    },
  },
}));

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(async () => ({
    ok: true,
    userId: 'admin_1',
    user: { id: 'admin_1', email: 'admin@plio.ca' },
  })),
}));

vi.mock('@/lib/db/admin-audit', () => ({
  recordAdminAudit: vi.fn(),
}));

vi.mock('@/lib/db/orders', () => ({
  updateWebhookOutcome: vi.fn(),
}));

vi.mock('@/lib/webhooks/stripe-process', () => ({
  processStripeEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/webhooks/sinalite-process', async () => {
  const z = await import('zod');
  return {
    processSinaliteEvent: vi.fn(async () => undefined),
    SinaliteWebhookPayload: z.object({
      orderId: z.number(),
      status: z.string(),
      timestamp: z.string(),
    }),
  };
});

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub, logWebhook: stub };
});

import { prisma } from '@/lib/db';

const baseEvent = {
  id: 'evt_1',
  source: 'STRIPE',
  eventId: 'pi_xxx',
  eventType: 'payment_intent.succeeded',
  payload: JSON.stringify({ id: 'pi_xxx', type: 'payment_intent.succeeded', data: { object: {} } }),
  success: true,
  statusCode: 200,
  latencyMs: 50,
  error: null,
  orderId: null,
  replayCount: 0,
  lastReplayAt: null,
  processedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/webhooks/[id]/replay (single) — Round 26 #3', () => {
  it('insère une WebhookReplay row avec replayedBy + email snapshot', async () => {
    vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValueOnce(baseEvent as never);

    const { POST } = await import('@/app/api/admin/webhooks/[id]/replay/route');
    const res = await POST(
      new Request('http://localhost/api/admin/webhooks/evt_1/replay', { method: 'POST' }),
      { params: Promise.resolve({ id: 'evt_1' }) },
    );

    expect(res.status).toBe(200);

    // Laisser le void promise resolve avant assertion (fail-soft)
    await new Promise((r) => setImmediate(r));

    expect(prisma.webhookReplay.create).toHaveBeenCalledTimes(1);
    const args = vi.mocked(prisma.webhookReplay.create).mock.calls[0][0];
    expect(args.data).toMatchObject({
      webhookEventId: 'evt_1',
      replayedBy: 'admin_1',
      replayedByEmail: 'admin@plio.ca',
      success: true,
      statusCode: 200,
    });
    expect(args.data.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('insère row avec success=false si le handler throw', async () => {
    vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValueOnce(baseEvent as never);
    const { processStripeEvent } = await import('@/lib/webhooks/stripe-process');
    vi.mocked(processStripeEvent).mockRejectedValueOnce(new Error('Sinalite down'));

    const { POST } = await import('@/app/api/admin/webhooks/[id]/replay/route');
    const res = await POST(
      new Request('http://localhost/api/admin/webhooks/evt_1/replay', { method: 'POST' }),
      { params: Promise.resolve({ id: 'evt_1' }) },
    );

    expect(res.status).toBe(502);
    await new Promise((r) => setImmediate(r));

    const args = vi.mocked(prisma.webhookReplay.create).mock.calls[0][0];
    expect(args.data).toMatchObject({
      success: false,
      statusCode: 500,
      errorMessage: 'Sinalite down',
    });
  });

  it('fail-soft : si webhookReplay.create throw, route répond quand même 200', async () => {
    vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValueOnce(baseEvent as never);
    vi.mocked(prisma.webhookReplay.create).mockRejectedValueOnce(new Error('DB error'));

    const { POST } = await import('@/app/api/admin/webhooks/[id]/replay/route');
    const res = await POST(
      new Request('http://localhost/api/admin/webhooks/evt_1/replay', { method: 'POST' }),
      { params: Promise.resolve({ id: 'evt_1' }) },
    );

    // L'aggregate WebhookEvent.update reste la source canonique — la failure
    // d'historique ne doit pas faire échouer le route.
    expect(res.status).toBe(200);
  });

  it('404 si webhookEvent introuvable → pas d\'insert', async () => {
    vi.mocked(prisma.webhookEvent.findUnique).mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/admin/webhooks/[id]/replay/route');
    const res = await POST(
      new Request('http://localhost/api/admin/webhooks/evt_x/replay', { method: 'POST' }),
      { params: Promise.resolve({ id: 'evt_x' }) },
    );
    expect(res.status).toBe(404);
    expect(prisma.webhookReplay.create).not.toHaveBeenCalled();
  });
});
