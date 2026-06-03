/**
 * Tests pour POST /api/admin/reviews/bulk — lock-in du workflow bulk
 * moderation. Round 24 #2 : feature découverte comme déjà implémentée,
 * tests ajoutés pour empêcher regression.
 *
 * Pattern identique à Round 16 #5 (broadcast tests) : mock toutes les
 * dépendances et test la choréographie.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    review: {
      updateMany: vi.fn(async () => ({ count: 0 })),
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
  recordAdminAudit: vi.fn(async () => ({})),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub, logAdmin: stub };
});

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

function makePost(body: unknown): Request {
  return new Request('http://localhost/api/admin/reviews/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    userId: 'admin_1',
    user: { id: 'admin_1', email: 'admin@plio.ca' },
  } as never);
  vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 0 });
});

describe('POST /api/admin/reviews/bulk', () => {
  it('403 si non-admin (guard fail)', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    } as never);
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makePost({ action: 'approve', ids: ['r_1'] }));
    expect(res.status).toBe(403);
    expect(prisma.review.updateMany).not.toHaveBeenCalled();
  });

  it('400 si Zod fail (no ids)', async () => {
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makePost({ action: 'approve', ids: [] }));
    expect(res.status).toBe(400);
  });

  it('400 si > 100 ids (safety cap)', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `r_${i}`);
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makePost({ action: 'approve', ids: tooMany }));
    expect(res.status).toBe(400);
  });

  it('400 si action inconnue', async () => {
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makePost({ action: 'delete', ids: ['r_1'] }));
    expect(res.status).toBe(400);
  });

  it('approve : updateMany status=APPROVED + publishedAt + nullify adminNote', async () => {
    vi.mocked(prisma.review.updateMany).mockResolvedValueOnce({ count: 3 });
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makePost({ action: 'approve', ids: ['r_1', 'r_2', 'r_3'] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, count: 3, action: 'approve' });

    const call = vi.mocked(prisma.review.updateMany).mock.calls[0]![0];
    expect(call.where).toEqual({ id: { in: ['r_1', 'r_2', 'r_3'] } });
    expect(call.data).toMatchObject({
      status: 'APPROVED',
      adminNote: null,
    });
    expect((call.data as { publishedAt: Date }).publishedAt).toBeInstanceOf(Date);
  });

  it('reject : updateMany status=REJECTED avec adminNote + nullify publishedAt', async () => {
    vi.mocked(prisma.review.updateMany).mockResolvedValueOnce({ count: 1 });
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makePost({
      action: 'reject',
      ids: ['r_1'],
      adminNote: 'Comment spammy',
    }));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.review.updateMany).mock.calls[0]![0];
    expect(call.data).toMatchObject({
      status: 'REJECTED',
      adminNote: 'Comment spammy',
      publishedAt: null,
    });
  });

  it('feature true : updateMany isFeatured=true', async () => {
    vi.mocked(prisma.review.updateMany).mockResolvedValueOnce({ count: 2 });
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makePost({
      action: 'feature',
      ids: ['r_1', 'r_2'],
      isFeatured: true,
    }));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.review.updateMany).mock.calls[0]![0];
    expect(call.data).toEqual({ isFeatured: true });
  });

  it('feature false : updateMany isFeatured=false', async () => {
    vi.mocked(prisma.review.updateMany).mockResolvedValueOnce({ count: 1 });
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makePost({
      action: 'feature',
      ids: ['r_1'],
      isFeatured: false,
    }));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.review.updateMany).mock.calls[0]![0];
    expect(call.data).toEqual({ isFeatured: false });
  });

  it('audit log appelé avec REVIEW_BULK_<action> + count', async () => {
    vi.mocked(prisma.review.updateMany).mockResolvedValueOnce({ count: 5 });
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    await POST(makePost({ action: 'approve', ids: ['a', 'b', 'c', 'd', 'e'] }));
    expect(recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin_1',
      adminEmail: 'admin@plio.ca',
      targetType: 'ORDER',
      data: expect.objectContaining({
        action: 'REVIEW_BULK_APPROVE',
        ids: ['a', 'b', 'c', 'd', 'e'],
        count: 5,
      }),
    }));
  });
});
