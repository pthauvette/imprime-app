/**
 * Tests pour POST /api/nps : auth, ownership, validation, upsert,
 * Slack alert sur detractor avec commentaire.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findUnique: vi.fn() },
    npsResponse: { upsert: vi.fn(async () => ({})) },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => {}),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return {
    logEmail: stub, log: stub, logStripe: stub, logSinalite: stub,
    logAuth: stub, logS3: stub, logAdmin: stub, logWebhook: stub,
  };
});

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { sendCriticalAlert } from '@/lib/alerting/slack';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/nps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function importPost() {
  vi.resetModules();
  return (await import('@/app/api/nps/route')).POST;
}

function userSession(id = 'user_1') {
  return { user: { id, email: 'user@plio.ca', role: 'USER' } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

const validOrderId = 'cm00abcdef0123456789012345';

describe('POST /api/nps', () => {
  it('401 si non-authentifié', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const POST = await importPost();
    const res = await POST(makeReq({ orderId: validOrderId, score: 9 }));
    expect(res.status).toBe(401);
  });

  it('404 si order introuvable', async () => {
    vi.mocked(auth).mockResolvedValue(userSession() as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(null);
    const POST = await importPost();
    const res = await POST(makeReq({ orderId: validOrderId, score: 9 }));
    expect(res.status).toBe(404);
  });

  it('403 si l\'order n\'appartient pas au user (et pas admin)', async () => {
    vi.mocked(auth).mockResolvedValue(userSession() as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      id: validOrderId, userId: 'other_user', status: 'DELIVERED',
    } as never);
    const POST = await importPost();
    const res = await POST(makeReq({ orderId: validOrderId, score: 9 }));
    expect(res.status).toBe(403);
  });

  it('400 si order pas DELIVERED', async () => {
    vi.mocked(auth).mockResolvedValue(userSession() as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      id: validOrderId, userId: 'user_1', status: 'IN_PRODUCTION',
    } as never);
    const POST = await importPost();
    const res = await POST(makeReq({ orderId: validOrderId, score: 9 }));
    expect(res.status).toBe(400);
  });

  it('400 si score > 10 ou < 0', async () => {
    vi.mocked(auth).mockResolvedValue(userSession() as never);
    const POST = await importPost();
    const r1 = await POST(makeReq({ orderId: validOrderId, score: 11 }));
    expect(r1.status).toBe(400);
    const r2 = await POST(makeReq({ orderId: validOrderId, score: -1 }));
    expect(r2.status).toBe(400);
  });

  it('200 + upsert avec score + comment trimmed', async () => {
    vi.mocked(auth).mockResolvedValue(userSession() as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      id: validOrderId, userId: 'user_1', status: 'DELIVERED',
    } as never);

    const POST = await importPost();
    const res = await POST(makeReq({
      orderId: validOrderId,
      score: 9,
      comment: '   Super expérience !   ',
    }));

    expect(res.status).toBe(200);
    expect(prisma.npsResponse.upsert).toHaveBeenCalledTimes(1);
    const upsert = vi.mocked(prisma.npsResponse.upsert).mock.calls[0][0];
    expect(upsert.where).toEqual({ orderId: validOrderId });
    expect(upsert.create.score).toBe(9);
    expect(upsert.create.comment).toBe('Super expérience !');
    expect(upsert.update.score).toBe(9);
  });

  it('comment vide ou whitespace-only → null', async () => {
    vi.mocked(auth).mockResolvedValue(userSession() as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      id: validOrderId, userId: 'user_1', status: 'DELIVERED',
    } as never);

    const POST = await importPost();
    await POST(makeReq({ orderId: validOrderId, score: 8, comment: '   ' }));

    const upsert = vi.mocked(prisma.npsResponse.upsert).mock.calls[0][0];
    expect(upsert.create.comment).toBeNull();
  });

  it('Slack alert envoyé si detractor (≤6) avec commentaire', async () => {
    vi.mocked(auth).mockResolvedValue(userSession() as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      id: validOrderId, userId: 'user_1', status: 'DELIVERED',
    } as never);

    const POST = await importPost();
    await POST(makeReq({
      orderId: validOrderId,
      score: 3,
      comment: 'Tellement déçu, livraison en retard de 2 semaines',
    }));

    await new Promise((r) => setImmediate(r));
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
    const alert = vi.mocked(sendCriticalAlert).mock.calls[0][0];
    expect(alert.severity).toBe('warning');
    expect(alert.title).toMatch(/NPS detractor/);
  });

  it('PAS de Slack alert si detractor sans commentaire (signal trop faible)', async () => {
    vi.mocked(auth).mockResolvedValue(userSession() as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      id: validOrderId, userId: 'user_1', status: 'DELIVERED',
    } as never);

    const POST = await importPost();
    await POST(makeReq({ orderId: validOrderId, score: 5 }));

    await new Promise((r) => setImmediate(r));
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('PAS de Slack alert si promoter avec commentaire', async () => {
    vi.mocked(auth).mockResolvedValue(userSession() as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      id: validOrderId, userId: 'user_1', status: 'DELIVERED',
    } as never);

    const POST = await importPost();
    await POST(makeReq({ orderId: validOrderId, score: 10, comment: 'Top !' }));

    await new Promise((r) => setImmediate(r));
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('admin peut soumettre pour un order qui n\'est pas le sien', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin_1', email: 'admin@plio.ca', role: 'ADMIN' },
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      id: validOrderId, userId: 'other_user', status: 'DELIVERED',
    } as never);

    const POST = await importPost();
    const res = await POST(makeReq({ orderId: validOrderId, score: 8 }));
    expect(res.status).toBe(200);
  });
});
