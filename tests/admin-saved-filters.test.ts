/**
 * Tests pour /api/admin/saved-filters et /api/admin/saved-filters/[id]
 * — Round 26 #5.
 *
 * Couvre :
 *   - GET : 403 si non-admin, 400 scope invalide, list filtré per-admin
 *   - POST : 400 schema fail, 200 create + return shape
 *   - DELETE : 404 missing, 403 si pas le propriétaire, 200 delete
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    adminSavedFilter: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
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

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub };
});

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    userId: 'admin_1',
    user: { id: 'admin_1', email: 'admin@plio.ca' },
  } as never);
});

describe('GET /api/admin/saved-filters', () => {
  it('403 si non-admin', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    } as never);
    const { GET } = await import('@/app/api/admin/saved-filters/route');
    const res = await GET(new Request('http://localhost/api/admin/saved-filters?scope=orders'));
    expect(res.status).toBe(403);
  });

  it('400 si scope manquant', async () => {
    const { GET } = await import('@/app/api/admin/saved-filters/route');
    const res = await GET(new Request('http://localhost/api/admin/saved-filters'));
    expect(res.status).toBe(400);
  });

  it('400 si scope hors whitelist (anti-wildcard)', async () => {
    const { GET } = await import('@/app/api/admin/saved-filters/route');
    const res = await GET(new Request('http://localhost/api/admin/saved-filters?scope=arbitrary'));
    expect(res.status).toBe(400);
  });

  it('200 + list per-admin filtré par scope', async () => {
    vi.mocked(prisma.adminSavedFilter.findMany).mockResolvedValueOnce([
      { id: 'f1', name: 'Refunds', queryString: 'status=PAID&q=urgent', createdAt: new Date() },
    ] as never);
    const { GET } = await import('@/app/api/admin/saved-filters/route');
    const res = await GET(new Request('http://localhost/api/admin/saved-filters?scope=orders'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filters).toHaveLength(1);
    expect(body.filters[0].name).toBe('Refunds');
    // Verify where filtré par userId = admin_1 + scope = orders
    const call = vi.mocked(prisma.adminSavedFilter.findMany).mock.calls[0][0];
    expect(call?.where).toEqual({ userId: 'admin_1', scope: 'orders' });
  });
});

describe('POST /api/admin/saved-filters', () => {
  it('400 si name vide', async () => {
    const { POST } = await import('@/app/api/admin/saved-filters/route');
    const res = await POST(new Request('http://localhost/api/admin/saved-filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'orders', name: '', queryString: 'status=PAID' }),
    }));
    expect(res.status).toBe(400);
  });

  it('400 si name > 60 chars', async () => {
    const { POST } = await import('@/app/api/admin/saved-filters/route');
    const res = await POST(new Request('http://localhost/api/admin/saved-filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'orders', name: 'a'.repeat(61), queryString: 'x=1' }),
    }));
    expect(res.status).toBe(400);
  });

  it('400 si queryString > 500 chars (safety cap)', async () => {
    const { POST } = await import('@/app/api/admin/saved-filters/route');
    const res = await POST(new Request('http://localhost/api/admin/saved-filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'orders', name: 'OK', queryString: 'x='.repeat(300) }),
    }));
    expect(res.status).toBe(400);
  });

  it('200 + create avec userId = current admin', async () => {
    vi.mocked(prisma.adminSavedFilter.create).mockResolvedValueOnce({
      id: 'new_1', name: 'Refunds', queryString: 'status=PAID', createdAt: new Date(),
    } as never);
    const { POST } = await import('@/app/api/admin/saved-filters/route');
    const res = await POST(new Request('http://localhost/api/admin/saved-filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'orders', name: 'Refunds', queryString: 'status=PAID' }),
    }));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.adminSavedFilter.create).mock.calls[0][0];
    expect(call.data).toMatchObject({
      userId: 'admin_1',
      scope: 'orders',
      name: 'Refunds',
      queryString: 'status=PAID',
    });
  });
});

describe('DELETE /api/admin/saved-filters/[id]', () => {
  const ctx = { params: Promise.resolve({ id: 'f1' }) };

  it('404 si filtre introuvable', async () => {
    vi.mocked(prisma.adminSavedFilter.findUnique).mockResolvedValueOnce(null);
    const { DELETE } = await import('@/app/api/admin/saved-filters/[id]/route');
    const res = await DELETE(new Request('http://localhost/api/admin/saved-filters/f1', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(404);
    expect(prisma.adminSavedFilter.delete).not.toHaveBeenCalled();
  });

  it('403 si filtre appartient à un autre admin (ownership explicite)', async () => {
    vi.mocked(prisma.adminSavedFilter.findUnique).mockResolvedValueOnce({ userId: 'other_admin' } as never);
    const { DELETE } = await import('@/app/api/admin/saved-filters/[id]/route');
    const res = await DELETE(new Request('http://localhost/api/admin/saved-filters/f1', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(403);
    expect(prisma.adminSavedFilter.delete).not.toHaveBeenCalled();
  });

  it('200 + delete si propriétaire', async () => {
    vi.mocked(prisma.adminSavedFilter.findUnique).mockResolvedValueOnce({ userId: 'admin_1' } as never);
    vi.mocked(prisma.adminSavedFilter.delete).mockResolvedValueOnce({} as never);
    const { DELETE } = await import('@/app/api/admin/saved-filters/[id]/route');
    const res = await DELETE(new Request('http://localhost/api/admin/saved-filters/f1', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(200);
    expect(prisma.adminSavedFilter.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });
});
