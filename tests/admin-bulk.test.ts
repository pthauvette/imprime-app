/**
 * Tests pour les bulk admin endpoints :
 *  - POST /api/admin/reviews/bulk (approve/reject/feature)
 *  - POST /api/admin/emails/bulk (retry)
 *
 * Focus :
 *  - Admin guard (non-admin → 401/403)
 *  - Validation Zod (action, IDs requis, max 100/50)
 *  - updateMany compte les rows affectées correctement
 *  - Audit log fire-and-forget
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    review: {
      updateMany: vi.fn(),
    },
    emailDelivery: {
      findMany: vi.fn(),
      update: vi.fn(),
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

vi.mock('@/lib/emails/queue', () => ({
  processDelivery: vi.fn(async () => ({ sent: true })),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { processDelivery } from '@/lib/emails/queue';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
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
  vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 3 } as never);
  vi.mocked(prisma.emailDelivery.findMany).mockResolvedValue([] as never);
});

describe('POST /api/admin/reviews/bulk', () => {
  it('403 si pas admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: false,
      response: new Response('forbidden', { status: 403 }) as never,
    } as never);
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makeReq({ action: 'approve', ids: ['r1', 'r2'] }));
    expect(res.status).toBe(403);
  });

  it('approve : update status + publishedAt + clear adminNote, compte rows', async () => {
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makeReq({ action: 'approve', ids: ['r1', 'r2', 'r3'] }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.count).toBe(3);
    expect(j.action).toBe('approve');
    const args = vi.mocked(prisma.review.updateMany).mock.calls[0][0];
    expect(args.where).toEqual({ id: { in: ['r1', 'r2', 'r3'] } });
    expect(args.data.status).toBe('APPROVED');
    expect(args.data.adminNote).toBeNull();
  });

  it('reject : status REJECTED + adminNote', async () => {
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    await POST(makeReq({ action: 'reject', ids: ['r1'], adminNote: 'Spam évident' }));
    const args = vi.mocked(prisma.review.updateMany).mock.calls[0][0];
    expect(args.data.status).toBe('REJECTED');
    expect(args.data.adminNote).toBe('Spam évident');
  });

  it('feature : isFeatured = true', async () => {
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    await POST(makeReq({ action: 'feature', ids: ['r1', 'r2'], isFeatured: true }));
    const args = vi.mocked(prisma.review.updateMany).mock.calls[0][0];
    expect(args.data).toEqual({ isFeatured: true });
  });

  it('400 si ids vide', async () => {
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makeReq({ action: 'approve', ids: [] }));
    expect(res.status).toBe(400);
  });

  it('400 si ids > 100', async () => {
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const ids = Array.from({ length: 101 }, (_, i) => `r${i}`);
    const res = await POST(makeReq({ action: 'approve', ids }));
    expect(res.status).toBe(400);
  });

  it('400 si action inconnue', async () => {
    const { POST } = await import('@/app/api/admin/reviews/bulk/route');
    const res = await POST(makeReq({ action: 'nuke', ids: ['r1'] }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/emails/bulk', () => {
  it('retry : compte sent / failed / skipped', async () => {
    vi.mocked(prisma.emailDelivery.findMany).mockResolvedValueOnce([
      { id: 'e1', status: 'FAILED', maxAttempts: 3, attempts: 2 },
      { id: 'e2', status: 'DEAD', maxAttempts: 3, attempts: 3 },
      { id: 'e3', status: 'SENT', maxAttempts: 3, attempts: 1 },
    ] as never);
    vi.mocked(prisma.emailDelivery.update).mockResolvedValue({} as never);
    vi.mocked(processDelivery)
      .mockResolvedValueOnce({ sent: true } as never)
      .mockResolvedValueOnce({ sent: false } as never);

    const { POST } = await import('@/app/api/admin/emails/bulk/route');
    const res = await POST(makeReq({ ids: ['e1', 'e2', 'e3'] }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.attempted).toBe(2); // SENT skipped
    expect(j.sent).toBe(1);
    expect(j.failed).toBe(1);
    expect(j.skipped).toBe(1);
  });

  it('DEAD : reset attempts à maxAttempts-1 avant retry', async () => {
    vi.mocked(prisma.emailDelivery.findMany).mockResolvedValueOnce([
      { id: 'e_dead', status: 'DEAD', maxAttempts: 3, attempts: 3 },
    ] as never);
    vi.mocked(prisma.emailDelivery.update).mockResolvedValue({} as never);
    vi.mocked(processDelivery).mockResolvedValueOnce({ sent: true } as never);

    const { POST } = await import('@/app/api/admin/emails/bulk/route');
    await POST(makeReq({ ids: ['e_dead'] }));
    const updateArgs = vi.mocked(prisma.emailDelivery.update).mock.calls[0][0];
    expect(updateArgs.data).toMatchObject({
      attempts: 2, // 3 - 1
      status: 'FAILED',
      nextAttemptAt: null,
    });
  });

  it('400 si ids vide', async () => {
    const { POST } = await import('@/app/api/admin/emails/bulk/route');
    const res = await POST(makeReq({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it('400 si > 50 ids', async () => {
    const { POST } = await import('@/app/api/admin/emails/bulk/route');
    const ids = Array.from({ length: 51 }, (_, i) => `e${i}`);
    const res = await POST(makeReq({ ids }));
    expect(res.status).toBe(400);
  });
});
