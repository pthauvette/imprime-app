/**
 * Tests pour /api/admin/promo-codes (GET + POST) et PATCH /[id].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    promoCode: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    adminAuditEvent: {
      create: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(async () => ({
    ok: true,
    user: { id: 'admin_1', email: 'admin@plio.ca' },
    userId: 'admin_1',
  })),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

function makeReq(body: unknown, method = 'POST'): Request {
  return new Request('http://localhost/api/admin/promo-codes', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    user: { id: 'admin_1', email: 'admin@plio.ca' },
    userId: 'admin_1',
  } as never);
  vi.mocked(prisma.promoCode.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.promoCode.create).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'promo_new',
    code: data.code,
    label: data.label ?? null,
    discountPct: data.discountPct ?? null,
    discountCents: data.discountCents ?? null,
    active: true,
    expiresAt: data.expiresAt ?? null,
    maxUses: data.maxUses ?? null,
    usesCount: 0,
    minSubtotalCents: data.minSubtotalCents ?? null,
    firstOrderOnly: data.firstOrderOnly ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as never);
});

describe('POST /api/admin/promo-codes', () => {
  it('crée un code 10 %', async () => {
    const { POST } = await import('@/app/api/admin/promo-codes/route');
    const res = await POST(makeReq({ code: 'bienvenue10', discountPct: 10 }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.promo.code).toBe('BIENVENUE10');
    expect(prisma.promoCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'BIENVENUE10',
        discountPct: 10,
        firstOrderOnly: false,
      }),
    });
  });

  it('normalise le code en upper + trim', async () => {
    const { POST } = await import('@/app/api/admin/promo-codes/route');
    await POST(makeReq({ code: '  noel2026  ', discountPct: 15 }));
    expect(prisma.promoCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'NOEL2026' }),
    });
  });

  it('refuse si code existe déjà — 409', async () => {
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValueOnce({
      id: 'existing',
      code: 'EXISTING',
    } as never);
    const { POST } = await import('@/app/api/admin/promo-codes/route');
    const res = await POST(makeReq({ code: 'existing', discountPct: 10 }));
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.code).toBe('DUPLICATE');
    expect(prisma.promoCode.create).not.toHaveBeenCalled();
  });

  it('refuse si les deux discount sont set (zod refine)', async () => {
    const { POST } = await import('@/app/api/admin/promo-codes/route');
    const res = await POST(makeReq({ code: 'BAD', discountPct: 10, discountCents: 500 }));
    expect(res.status).toBe(400);
  });

  it('refuse si aucun discount n\'est set', async () => {
    const { POST } = await import('@/app/api/admin/promo-codes/route');
    const res = await POST(makeReq({ code: 'BAD' }));
    expect(res.status).toBe(400);
  });

  it('accepte discountCents seul', async () => {
    const { POST } = await import('@/app/api/admin/promo-codes/route');
    const res = await POST(makeReq({ code: 'FIVEOFF', discountCents: 500 }));
    expect(res.status).toBe(201);
  });

  it('parse expiresAt en Date', async () => {
    const { POST } = await import('@/app/api/admin/promo-codes/route');
    await POST(makeReq({ code: 'TEST', discountPct: 10, expiresAt: '2027-12-31T23:59:59.000Z' }));
    const args = vi.mocked(prisma.promoCode.create).mock.calls[0][0];
    expect((args.data.expiresAt as Date).toISOString()).toBe('2027-12-31T23:59:59.000Z');
  });

  it('refuse non-admin via requireAdmin gate', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }) as never,
    } as never);
    const { POST } = await import('@/app/api/admin/promo-codes/route');
    const res = await POST(makeReq({ code: 'TEST', discountPct: 10 }));
    expect(res.status).toBe(403);
    expect(prisma.promoCode.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/promo-codes/[id]', () => {
  beforeEach(() => {
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue({
      id: 'promo_1',
      code: 'TEST',
      active: true,
    } as never);
    vi.mocked(prisma.promoCode.update).mockResolvedValue({
      id: 'promo_1',
      code: 'TEST',
      active: false,
    } as never);
  });

  it('toggle active', async () => {
    const { PATCH } = await import('@/app/api/admin/promo-codes/[id]/route');
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'promo_1' }) });
    expect(res.status).toBe(200);
    expect(prisma.promoCode.update).toHaveBeenCalledWith({
      where: { id: 'promo_1' },
      data: { active: false },
    });
  });

  it('404 si promo introuvable', async () => {
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValueOnce(null);
    const { PATCH } = await import('@/app/api/admin/promo-codes/[id]/route');
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'gone' }) });
    expect(res.status).toBe(404);
  });

  it('clear nullable champs avec null explicite', async () => {
    const { PATCH } = await import('@/app/api/admin/promo-codes/[id]/route');
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresAt: null, maxUses: null, label: null }),
    });
    await PATCH(req, { params: Promise.resolve({ id: 'promo_1' }) });
    expect(prisma.promoCode.update).toHaveBeenCalledWith({
      where: { id: 'promo_1' },
      data: { expiresAt: null, maxUses: null, label: null },
    });
  });
});
