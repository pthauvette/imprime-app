/**
 * Tests pour PATCH /api/admin/reviews/[id] action=reply — Round 25 #4.
 *
 * Couvre la nouvelle branche reply du PATCH route (les autres branches
 * approve/reject/feature sont déjà testées implicitement via le bulk
 * route + manual). Focus :
 *   - 403 si non-admin
 *   - 400 si Zod fail (string > 1500 chars)
 *   - reply non-vide → set adminReply + adminReplyAt
 *   - reply vide → clear (null + null)
 *   - reply trim les whitespace
 *   - 404 si review introuvable
 *   - audit log avec action=REVIEW_REPLY
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    review: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

function makePatch(body: unknown): Request {
  return new Request('http://localhost/api/admin/reviews/rev_1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: 'rev_1' }) };

const baseReview = {
  id: 'rev_1',
  orderId: 'order_1',
  status: 'APPROVED',
  rating: 5,
  publishedAt: new Date('2026-05-01'),
  adminReply: null,
  adminReplyAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    userId: 'admin_1',
    user: { id: 'admin_1', email: 'admin@plio.ca' },
  } as never);
  vi.mocked(prisma.review.findUnique).mockResolvedValue(baseReview as never);
  vi.mocked(prisma.review.update).mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    ...baseReview,
    ...args.data,
  })) as never);
});

describe('PATCH /api/admin/reviews/[id] — action=reply (Round 25 #4)', () => {
  it('403 si non-admin', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    } as never);
    const { PATCH } = await import('@/app/api/admin/reviews/[id]/route');
    const res = await PATCH(makePatch({ action: 'reply', adminReply: 'hi' }), ctx);
    expect(res.status).toBe(403);
  });

  it('404 si review introuvable', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValueOnce(null);
    const { PATCH } = await import('@/app/api/admin/reviews/[id]/route');
    const res = await PATCH(makePatch({ action: 'reply', adminReply: 'hi' }), ctx);
    expect(res.status).toBe(404);
  });

  it('400 si adminReply > 1500 chars', async () => {
    const { PATCH } = await import('@/app/api/admin/reviews/[id]/route');
    const res = await PATCH(makePatch({ action: 'reply', adminReply: 'a'.repeat(1501) }), ctx);
    expect(res.status).toBe(400);
  });

  it('reply non-vide → set adminReply + adminReplyAt = now', async () => {
    const { PATCH } = await import('@/app/api/admin/reviews/[id]/route');
    const res = await PATCH(makePatch({ action: 'reply', adminReply: 'Merci pour ton avis !' }), ctx);
    expect(res.status).toBe(200);

    const call = vi.mocked(prisma.review.update).mock.calls[0]![0];
    expect(call.where).toEqual({ id: 'rev_1' });
    expect(call.data).toMatchObject({ adminReply: 'Merci pour ton avis !' });
    expect((call.data as { adminReplyAt: Date }).adminReplyAt).toBeInstanceOf(Date);
  });

  it('reply trim les whitespace', async () => {
    const { PATCH } = await import('@/app/api/admin/reviews/[id]/route');
    await PATCH(makePatch({ action: 'reply', adminReply: '  Merci !  ' }), ctx);
    const call = vi.mocked(prisma.review.update).mock.calls[0]![0];
    expect(call.data).toMatchObject({ adminReply: 'Merci !' });
  });

  it('reply vide (string vide) → clear adminReply + adminReplyAt = null', async () => {
    const { PATCH } = await import('@/app/api/admin/reviews/[id]/route');
    await PATCH(makePatch({ action: 'reply', adminReply: '' }), ctx);
    const call = vi.mocked(prisma.review.update).mock.calls[0]![0];
    expect(call.data).toEqual({ adminReply: null, adminReplyAt: null });
  });

  it('reply whitespace-only → clear (trim → empty)', async () => {
    const { PATCH } = await import('@/app/api/admin/reviews/[id]/route');
    await PATCH(makePatch({ action: 'reply', adminReply: '   \n  ' }), ctx);
    const call = vi.mocked(prisma.review.update).mock.calls[0]![0];
    expect(call.data).toEqual({ adminReply: null, adminReplyAt: null });
  });

  it('audit log appelé avec action=REVIEW_REPLY', async () => {
    const { PATCH } = await import('@/app/api/admin/reviews/[id]/route');
    await PATCH(makePatch({ action: 'reply', adminReply: 'hi' }), ctx);
    expect(recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin_1',
      data: expect.objectContaining({
        action: 'REVIEW_REPLY',
        reviewId: 'rev_1',
      }),
    }));
  });
});
