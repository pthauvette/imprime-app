/**
 * Tests pour GET /api/account/data-export — PIPEDA right to access.
 *
 * Couvre auth, contenu du payload, audit log avec le bon kind, rate-limit,
 * inclusion des nouveaux types de data (reviews, NPS).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    order: { findMany: vi.fn(async () => []) },
    address: { findMany: vi.fn(async () => []) },
    savedConfig: { findMany: vi.fn(async () => []) },
    draft: { findMany: vi.fn(async () => []) },
    designDraft: { findMany: vi.fn(async () => []) },
    referralReward: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
    },
    newsletterSubscriber: { findUnique: vi.fn(async () => null) },
    contactMessage: { findMany: vi.fn(async () => []) },
    review: { findMany: vi.fn(async () => []) },
    npsResponse: { findMany: vi.fn(async () => []) },
    adminAuditEvent: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { rateLimit } from '@/lib/ratelimit';

async function importGet() {
  vi.resetModules();
  return (await import('@/app/api/account/data-export/route')).GET;
}

const baseUser = {
  id: 'user_1',
  email: 'me@plio.ca',
  name: 'Me',
  firstName: 'Me',
  lastName: null,
  phone: null,
  role: 'USER',
  emailVerified: null,
  emailDeliveryNotifications: true,
  referralCode: null,
  referredByCode: null,
  referralCreditCents: 0,
  adminNotes: null,
  adminNotesUpdatedAt: null,
  adminNotesUpdatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function session() {
  return { user: { id: 'user_1', email: 'me@plio.ca', role: 'USER' } };
}

function makeReq(): Request {
  return new Request('http://localhost/api/account/data-export', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true } as never);
});

describe('GET /api/account/data-export', () => {
  it('401 si non-authentifié', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const GET = await importGet();
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('429 si rate-limit dépassé', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    const limitResponse = new Response(JSON.stringify({ error: 'rate' }), { status: 429 });
    vi.mocked(rateLimit).mockResolvedValueOnce({ ok: false, response: limitResponse } as never);
    const GET = await importGet();
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
  });

  it('404 si user introuvable', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    const GET = await importGet();
    const res = await GET(makeReq());
    expect(res.status).toBe(404);
  });

  it('200 + JSON download avec Content-Disposition', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(baseUser as never);
    const GET = await importGet();
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="plio-data-export_/);
  });

  it('payload inclut les nouveaux types (reviews, npsResponses)', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(baseUser as never);
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      { id: 'rev_1', rating: 5, comment: 'Top !', orderId: 'o_1' },
    ] as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([{ id: 'o_1' } as never]);
    vi.mocked(prisma.npsResponse.findMany).mockResolvedValueOnce([
      { id: 'nps_1', orderId: 'o_1', score: 9, comment: 'Excellent' },
    ] as never);

    const GET = await importGet();
    const res = await GET(makeReq());
    const body = await res.text();
    const parsed = JSON.parse(body);

    expect(parsed.reviews).toHaveLength(1);
    expect(parsed.reviews[0].comment).toBe('Top !');
    expect(parsed.npsResponses).toHaveLength(1);
    expect(parsed.npsResponses[0].score).toBe(9);
    expect(parsed._meta.legalBasis).toMatch(/PIPEDA/);
  });

  it('audit log avec kind=ADMIN_DATA_EXPORT + action=USER_DATA_EXPORT_SELF', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(baseUser as never);

    const GET = await importGet();
    await GET(makeReq());

    await new Promise((r) => setImmediate(r));
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(audit.data.kind).toBe('ADMIN_DATA_EXPORT');
    const data = JSON.parse(audit.data.data as string);
    expect(data.action).toBe('USER_DATA_EXPORT_SELF');
    expect(data).toHaveProperty('reviewCount');
    expect(data).toHaveProperty('npsCount');
  });

  it('Sinalite payload omis du JSON pour économiser la taille', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(baseUser as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'o_1', sinalitePayload: '{"huge":"data"}'.repeat(1000), events: [] } as never,
    ]);

    const GET = await importGet();
    const res = await GET(makeReq());
    const body = await res.text();
    const parsed = JSON.parse(body);

    expect(parsed.orders[0].sinalitePayload).toMatch(/snapshot omis/);
  });

  it('si NPS query throw (migration pas appliquée), fallback []', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(baseUser as never);
    vi.mocked(prisma.npsResponse.findMany).mockRejectedValueOnce(new Error('table missing'));

    const GET = await importGet();
    const res = await GET(makeReq());
    const body = await res.text();
    const parsed = JSON.parse(body);

    expect(res.status).toBe(200);
    expect(parsed.npsResponses).toEqual([]);
  });
});
