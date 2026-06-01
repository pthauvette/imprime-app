/**
 * Tests pour POST /api/abandoned-cart (capture) + GET /api/cron/abandoned-
 * cart (envoi recovery).
 *
 * Cron côté logique : filtre par age window, skip si Order existe après
 * updatedAt, skip si lastStep=review, dédup via emailSentAt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    abandonedCart: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      // Round 16 #4 : capture endpoint utilise maintenant upsert atomique
      // sur UNIQUE (email, productId).
      upsert: vi.fn(async (args: { create: Record<string, unknown> }) => ({
        id: 'cart_new',
        ...args.create,
      })),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'cart_new',
        ...args.data,
      })),
      update: vi.fn(async () => ({})),
      // Round 39 #5 : claim atomique avant send (race protection).
      // Default count:1 = claim succeeded, autorise les tests existants.
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    order: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    cronRun: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

vi.mock('@/lib/emails/send', () => ({
  sendAbandonedCartEmail: vi.fn(async () => ({ sent: true, id: 'del_1' })),
}));

vi.mock('@/lib/sinalite/client', () => ({
  sinalite: {
    getProduct: vi.fn(async () => ({ name: 'Cartes 14pt UV' })),
  },
}));

vi.mock('@/lib/cron/healthcheck', () => ({
  pingCronHealthcheck: vi.fn(async () => {}),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return {
    log: stub, logStripe: stub, logSinalite: stub, logAuth: stub,
    logEmail: stub, logS3: stub, logAdmin: stub, logWebhook: stub,
  };
});

import { prisma } from '@/lib/db';
import { sendAbandonedCartEmail } from '@/lib/emails/send';
import { rateLimit } from '@/lib/ratelimit';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true } as never);
});

async function importCapture() {
  vi.resetModules();
  return (await import('@/app/api/abandoned-cart/route')).POST;
}

async function importCron() {
  vi.resetModules();
  return (await import('@/app/api/cron/abandoned-cart/route')).GET;
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/abandoned-cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/abandoned-cart (capture)', () => {
  // Round 16 #4 : refactored à prisma.upsert atomique sur UNIQUE
  // (email, productId). Plus de findFirst + create/update — un seul call DB.

  it('appelle upsert avec where email_productId composite', async () => {
    const POST = await importCapture();
    const res = await POST(
      makeReq({
        email: 'sophie@studio.ca',
        productId: 7,
        resumeQuery: 'options=12,34',
        lastStep: 'shipping',
      }),
    );
    expect(res.status).toBe(200);
    expect(prisma.abandonedCart.upsert).toHaveBeenCalledTimes(1);
    const args = vi.mocked(prisma.abandonedCart.upsert).mock.calls[0]![0]!;
    expect(args.where).toEqual({
      email_productId: { email: 'sophie@studio.ca', productId: 7 },
    });
    expect(args.create).toEqual(expect.objectContaining({
      email: 'sophie@studio.ca',
      productId: 7,
      resumeQuery: 'options=12,34',
      lastStep: 'shipping',
    }));
    expect(args.update).toEqual(expect.objectContaining({
      resumeQuery: 'options=12,34',
      lastStep: 'shipping',
      emailSentAt: null, // reset pour re-éligibilité recovery
    }));
  });

  it('update reset emailSentAt à null (re-eligible pour recovery)', async () => {
    const POST = await importCapture();
    await POST(
      makeReq({
        email: 'sophie@studio.ca',
        productId: 7,
        resumeQuery: 'options=12,34&files=front:s3...',
        lastStep: 'upload',
      }),
    );
    const args = vi.mocked(prisma.abandonedCart.upsert).mock.calls[0]![0]!;
    expect(args.update.emailSentAt).toBeNull();
  });

  it('400 si email invalide', async () => {
    const POST = await importCapture();
    const res = await POST(
      makeReq({
        email: 'not-an-email',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'shipping',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('400 si lastStep invalide', async () => {
    const POST = await importCapture();
    const res = await POST(
      makeReq({
        email: 'a@b.ca',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'unknown-step',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('email lowercase normalisé dans where + create', async () => {
    const POST = await importCapture();
    await POST(
      makeReq({
        email: 'Sophie@Studio.CA',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'shipping',
      }),
    );
    const args = vi.mocked(prisma.abandonedCart.upsert).mock.calls[0]![0]!;
    expect(args.where.email_productId?.email).toBe('sophie@studio.ca');
    expect(args.create.email).toBe('sophie@studio.ca');
  });
});

describe('GET /api/cron/abandoned-cart', () => {
  function makeReqCron(): import('next/server').NextRequest {
    return new Request('http://localhost/api/cron/abandoned-cart') as never;
  }

  it('envoie le recovery email + claim atomique avant send (Round 39 #5)', async () => {
    vi.mocked(prisma.abandonedCart.findMany).mockResolvedValueOnce([
      {
        id: 'cart_1',
        email: 'sophie@studio.ca',
        productId: 7,
        resumeQuery: 'options=12,34',
        lastStep: 'shipping',
        updatedAt: new Date(Date.now() - 36 * 3600 * 1000),
      } as never,
    ]);
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      firstName: 'Sophie',
      name: 'Sophie B',
    } as never);

    const GET = await importCron();
    const res = await GET(makeReqCron());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(json.skippedConverted).toBe(0);
    expect(json.skippedReview).toBe(0);

    // Round 39 #5 — claim atomique : updateMany WHERE id + emailSentAt:null
    expect(prisma.abandonedCart.updateMany).toHaveBeenCalledTimes(1);
    const claimArgs = vi.mocked(prisma.abandonedCart.updateMany).mock.calls[0]![0]!;
    expect(claimArgs.where).toEqual({ id: 'cart_1', emailSentAt: null });
    expect((claimArgs.data as { emailSentAt: Date }).emailSentAt).toBeInstanceOf(Date);

    expect(sendAbandonedCartEmail).toHaveBeenCalledTimes(1);
    const args = vi.mocked(sendAbandonedCartEmail).mock.calls[0][0];
    expect(args.firstName).toBe('Sophie');
    expect(args.productName).toBe('Cartes 14pt UV');
    expect(args.resumeUrl).toContain('/api/recovery/click?cart=');
    expect(decodeURIComponent(args.resumeUrl)).toContain('/order/review?productId=7&options=12,34');

    // Round 39 #5 — Pas d'update additionnel sur success (claim a déjà set emailSentAt)
    expect(prisma.abandonedCart.update).not.toHaveBeenCalled();
  });

  it('Round 39 #5 : si claim count=0 (race), skip ce cart sans send', async () => {
    vi.mocked(prisma.abandonedCart.findMany).mockResolvedValueOnce([
      {
        id: 'cart_race',
        email: 'sophie@studio.ca',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'shipping',
        updatedAt: new Date(Date.now() - 36 * 3600 * 1000),
      } as never,
    ]);
    // Simule un autre cron qui a déjà claim ce row
    vi.mocked(prisma.abandonedCart.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    const GET = await importCron();
    const res = await GET(makeReqCron());
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.failed).toBe(0);
    expect(sendAbandonedCartEmail).not.toHaveBeenCalled();
  });

  it('Round 39 #5 : send fail → reset emailSentAt à null pour retry next run', async () => {
    vi.mocked(prisma.abandonedCart.findMany).mockResolvedValueOnce([
      {
        id: 'cart_fail',
        email: 'sophie@studio.ca',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'shipping',
        updatedAt: new Date(Date.now() - 36 * 3600 * 1000),
      } as never,
    ]);
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(sendAbandonedCartEmail).mockRejectedValueOnce(new Error('SES timeout'));

    const GET = await importCron();
    const res = await GET(makeReqCron());
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.sent).toBe(0);
    // Update appelé pour reset emailSentAt à null
    expect(prisma.abandonedCart.update).toHaveBeenCalledTimes(1);
    const upd = vi.mocked(prisma.abandonedCart.update).mock.calls[0][0];
    expect(upd.data.emailSentAt).toBeNull();
  });

  it('Round 45 #4 : email suppressed (hard bounce) → NE reset PAS emailSentAt', async () => {
    vi.mocked(prisma.abandonedCart.findMany).mockResolvedValueOnce([
      {
        id: 'cart_supp',
        email: 'bounce@studio.ca',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'shipping',
        updatedAt: new Date(Date.now() - 36 * 3600 * 1000),
      } as never,
    ]);
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);
    // queueEmail skip un suppressed AVANT d'envoyer : { sent:false, skipped:'suppressed' }
    vi.mocked(sendAbandonedCartEmail).mockResolvedValueOnce({
      sent: false,
      id: 'suppressed',
      skipped: 'suppressed',
    } as never);

    const GET = await importCron();
    const res = await GET(makeReqCron());
    const json = await res.json();
    expect(json.skippedUnsendable).toBe(1);
    expect(json.failed).toBe(0);
    expect(json.sent).toBe(0);
    // Cart reste claimé (décision délibérée) — PAS de reset, sinon re-skip horaire à l'infini.
    expect(prisma.abandonedCart.update).not.toHaveBeenCalled();
  });

  it('Round 45 #4 : email throttled (cap CASL) → NE reset PAS emailSentAt', async () => {
    vi.mocked(prisma.abandonedCart.findMany).mockResolvedValueOnce([
      {
        id: 'cart_thr',
        email: 'busy@studio.ca',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'shipping',
        updatedAt: new Date(Date.now() - 36 * 3600 * 1000),
      } as never,
    ]);
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(sendAbandonedCartEmail).mockResolvedValueOnce({
      sent: false,
      id: 'throttled',
      skipped: 'throttled',
    } as never);

    const GET = await importCron();
    const res = await GET(makeReqCron());
    const json = await res.json();
    expect(json.skippedUnsendable).toBe(1);
    expect(json.failed).toBe(0);
    expect(prisma.abandonedCart.update).not.toHaveBeenCalled();
  });

  it('Round 45 #4 : échec SES réel (sent:false sans skipped) → reset emailSentAt pour retry', async () => {
    vi.mocked(prisma.abandonedCart.findMany).mockResolvedValueOnce([
      {
        id: 'cart_failreal',
        email: 'sophie@studio.ca',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'shipping',
        updatedAt: new Date(Date.now() - 36 * 3600 * 1000),
      } as never,
    ]);
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never);
    // sent:false SANS skipped = vrai échec d'envoi → on garde le retry (R39 #5)
    vi.mocked(sendAbandonedCartEmail).mockResolvedValueOnce({
      sent: false,
      id: 'del_x',
    } as never);

    const GET = await importCron();
    const res = await GET(makeReqCron());
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.skippedUnsendable).toBe(0);
    expect(prisma.abandonedCart.update).toHaveBeenCalledTimes(1);
    const upd = vi.mocked(prisma.abandonedCart.update).mock.calls[0][0];
    expect(upd.data.emailSentAt).toBeNull();
  });

  it('skip si Order existe pour email après updatedAt (converted)', async () => {
    vi.mocked(prisma.abandonedCart.findMany).mockResolvedValueOnce([
      {
        id: 'cart_1',
        email: 'sophie@studio.ca',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'shipping',
        updatedAt: new Date(Date.now() - 36 * 3600 * 1000),
      } as never,
    ]);
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce({ id: 'o_1' } as never);

    const GET = await importCron();
    const res = await GET(makeReqCron());
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.skippedConverted).toBe(1);
    expect(sendAbandonedCartEmail).not.toHaveBeenCalled();
    // Round 39 #5 : claim atomique a déjà set emailSentAt pour skip future
    // re-checks — pas besoin d'update additionnel.
    expect(prisma.abandonedCart.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.abandonedCart.update).not.toHaveBeenCalled();
  });

  it('skip si lastStep=review (95% conversion, on n\'embête pas)', async () => {
    vi.mocked(prisma.abandonedCart.findMany).mockResolvedValueOnce([
      {
        id: 'cart_1',
        email: 'sophie@studio.ca',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'review',
        updatedAt: new Date(Date.now() - 36 * 3600 * 1000),
      } as never,
    ]);

    const GET = await importCron();
    const res = await GET(makeReqCron());
    const json = await res.json();
    expect(json.skippedReview).toBe(1);
    expect(sendAbandonedCartEmail).not.toHaveBeenCalled();
  });

  it('Round 46 : un panier qui throw (order.findFirst) n\'avorte PAS le run (200 isolé) + les autres carts continuent', async () => {
    // Avant le fix : order.findFirst non gardé → throw propage au catch externe
    // → HTTP 500 + toute la batch perdue (incident prod 2026-06-01 10:57).
    // Après : erreur isolée par-panier (failed++ + continue), run reste 200.
    vi.mocked(prisma.abandonedCart.findMany).mockResolvedValueOnce([
      {
        id: 'cart_bad',
        email: 'bad@studio.ca',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'shipping',
        updatedAt: new Date(Date.now() - 36 * 3600 * 1000),
      } as never,
      {
        id: 'cart_ok',
        email: 'ok@studio.ca',
        productId: 7,
        resumeQuery: 'x',
        lastStep: 'shipping',
        updatedAt: new Date(Date.now() - 36 * 3600 * 1000),
      } as never,
    ]);
    // cart_bad : order.findFirst throw (1er appel) ; cart_ok : null (2e appel)
    vi.mocked(prisma.order.findFirst)
      .mockRejectedValueOnce(new Error('DB blip'))
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const GET = await importCron();
    const res = await GET(makeReqCron());

    expect(res.status).toBe(200); // PAS 500 — l'erreur d'un cart n'avorte plus le run
    const json = await res.json();
    expect(json.failed).toBe(1); // cart_bad isolé
    expect(json.sent).toBe(1); // cart_ok traité malgré l'échec du précédent
    expect(sendAbandonedCartEmail).toHaveBeenCalledTimes(1); // seulement cart_ok
    // cart_bad : claim reset (best-effort) pour retry au prochain run
    expect(prisma.abandonedCart.update).toHaveBeenCalled();
  });

  it('401 si Bearer token wrong en prod-like setup', async () => {
    vi.stubEnv('CRON_SECRET', 'expected_secret');
    const GET = await importCron();
    const res = await GET(
      new Request('http://localhost/api/cron/abandoned-cart', {
        headers: { authorization: 'Bearer wrong' },
      }) as never,
    );
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });
});
