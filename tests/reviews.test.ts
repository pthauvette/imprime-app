/**
 * Tests pour /api/reviews/submit + reviewSubmitToken helper.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findUnique: vi.fn() },
    review: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

import { prisma } from '@/lib/db';
import { reviewSubmitToken } from '@/lib/reviews/token';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const baseOrder = {
  id: 'order_xyz',
  status: 'DELIVERED',
  productSummary: 'Cartes 14pt',
  shipName: 'Sophie Beauchamp',
  user: { firstName: 'Sophie', name: 'Sophie Beauchamp', email: 's@p.ca' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);
  vi.mocked(prisma.review.findUnique).mockResolvedValue(null);
});

describe('reviewSubmitToken', () => {
  it('déterministe : même orderId = même token', () => {
    expect(reviewSubmitToken('order_abc')).toBe(reviewSubmitToken('order_abc'));
  });
  it('différent par orderId', () => {
    expect(reviewSubmitToken('order_a')).not.toBe(reviewSubmitToken('order_b'));
  });
  it('32 chars hex', () => {
    expect(reviewSubmitToken('o')).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('POST /api/reviews/submit', () => {
  it('crée la review en status PENDING', async () => {
    vi.mocked(prisma.review.create).mockResolvedValueOnce({} as never);
    const { POST } = await import('@/app/api/reviews/submit/route');
    const token = reviewSubmitToken('order_xyz');
    const res = await POST(makeReq({
      orderId: 'order_xyz', token, rating: 5, comment: 'Top !',
    }));
    expect(res.status).toBe(200);
    const args = vi.mocked(prisma.review.create).mock.calls[0][0];
    expect(args.data).toMatchObject({
      orderId: 'order_xyz',
      rating: 5,
      comment: 'Top !',
      status: 'PENDING',
    });
  });

  it('400 si token invalide', async () => {
    const { POST } = await import('@/app/api/reviews/submit/route');
    const res = await POST(makeReq({
      orderId: 'order_xyz', token: 'bad', rating: 5,
    }));
    expect(res.status).toBe(400);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('400 si order pas DELIVERED', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
      ...baseOrder, status: 'SHIPPED',
    } as never);
    const { POST } = await import('@/app/api/reviews/submit/route');
    const token = reviewSubmitToken('order_xyz');
    const res = await POST(makeReq({
      orderId: 'order_xyz', token, rating: 5,
    }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/livrée/);
  });

  it('idempotent si déjà submitted', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValueOnce({
      orderId: 'order_xyz', rating: 5,
    } as never);
    const { POST } = await import('@/app/api/reviews/submit/route');
    const token = reviewSubmitToken('order_xyz');
    const res = await POST(makeReq({ orderId: 'order_xyz', token, rating: 5 }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.alreadySubmitted).toBe(true);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('404 si order introuvable', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/reviews/submit/route');
    const token = reviewSubmitToken('order_xyz');
    const res = await POST(makeReq({ orderId: 'order_xyz', token, rating: 5 }));
    expect(res.status).toBe(404);
  });

  it('400 si rating hors range', async () => {
    const { POST } = await import('@/app/api/reviews/submit/route');
    const res = await POST(makeReq({
      orderId: 'order_xyz', token: reviewSubmitToken('order_xyz'), rating: 10,
    }));
    expect(res.status).toBe(400);
  });

  it('displayName custom override fallback firstName', async () => {
    vi.mocked(prisma.review.create).mockResolvedValueOnce({} as never);
    const { POST } = await import('@/app/api/reviews/submit/route');
    const token = reviewSubmitToken('order_xyz');
    await POST(makeReq({
      orderId: 'order_xyz', token, rating: 4, displayName: 'Sophie B.',
    }));
    const args = vi.mocked(prisma.review.create).mock.calls[0][0];
    expect(args.data.displayName).toBe('Sophie B.');
  });

  it('fallback à user.firstName si pas de displayName', async () => {
    vi.mocked(prisma.review.create).mockResolvedValueOnce({} as never);
    const { POST } = await import('@/app/api/reviews/submit/route');
    const token = reviewSubmitToken('order_xyz');
    await POST(makeReq({ orderId: 'order_xyz', token, rating: 5 }));
    const args = vi.mocked(prisma.review.create).mock.calls[0][0];
    expect(args.data.displayName).toBe('Sophie');
  });
});
