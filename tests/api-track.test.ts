/**
 * Tests pour POST /api/track — lookup public d'une commande par
 * orderNumber + email avec rate-limit + 404 générique pour pas leak.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function importFresh() {
  vi.resetModules();
  return (await import('@/app/api/track/route')).POST;
}

const baseOrder = {
  id: 'cm00abcdef0123456789012345',
  sinaliteOrderId: 'SIN-48312',
  status: 'IN_PRODUCTION',
  paidAt: new Date('2026-05-10T14:00:00Z'),
  createdAt: new Date('2026-05-10T13:55:00Z'),
  events: [
    {
      kind: 'PAYMENT_SUCCEEDED',
      createdAt: new Date('2026-05-10T14:00:00Z'),
      data: null,
    },
    {
      kind: 'SINALITE_SUBMITTED',
      createdAt: new Date('2026-05-10T14:05:00Z'),
      data: null,
    },
    {
      kind: 'SINALITE_STATUS_CHANGED',
      createdAt: new Date('2026-05-11T08:00:00Z'),
      data: JSON.stringify({ status: 'IN_PRODUCTION' }),
    },
  ],
  user: { email: 'sophie@studio.ca', firstName: 'Sophie' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true } as never);
});

describe('POST /api/track', () => {
  it('200 + timeline + tracking quand le pair (orderNumber, email) match', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(baseOrder as never);

    const POST = await importFresh();
    const res = await POST(makeReq({ orderNumber: 'SIN-48312', email: 'sophie@studio.ca' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.order.displayNumber).toBe('#SIN-48312');
    expect(json.order.status).toBe('IN_PRODUCTION');
    expect(json.order.firstName).toBe('Sophie');
    expect(json.order.timeline).toHaveLength(5);
    // Paiement et soumission done, production current, expédiée/livrée pas done
    const labels = json.order.timeline.map((s: { label: string; done: boolean }) => ({ label: s.label, done: s.done }));
    expect(labels[0]).toEqual({ label: 'Paiement confirmé', done: true });
    expect(labels[1]).toEqual({ label: 'Envoi à la presse', done: true });
    expect(labels[2]).toEqual({ label: 'En production', done: true });
    expect(labels[3]).toEqual({ label: 'Expédiée', done: false });
    expect(labels[4]).toEqual({ label: 'Livrée', done: false });
  });

  it('404 générique si pas de match (pas de leak existence)', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([]);

    const POST = await importFresh();
    const res = await POST(makeReq({ orderNumber: 'SIN-99999', email: 'sophie@studio.ca' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/Aucune commande/);
  });

  it('case-insensitive sur email + normalise # prefix', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(baseOrder as never);

    const POST = await importFresh();
    const res = await POST(makeReq({ orderNumber: '#sin-48312', email: 'Sophie@Studio.ca' }));
    expect(res.status).toBe(200);

    const call = vi.mocked(prisma.order.findFirst).mock.calls[0][0];
    // L'email est passé en lower au where
    const where = JSON.stringify(call?.where);
    expect(where).toContain('"email":"sophie@studio.ca"');
  });

  it('404 si email valide mais aucun order trouvé via suffix', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { ...baseOrder, id: 'cm00xxxxxxxx0123456789AAAAA' } as never,
    ]);

    const POST = await importFresh();
    const res = await POST(makeReq({ orderNumber: 'BBBBBB', email: 'sophie@studio.ca' }));
    expect(res.status).toBe(404);
  });

  it('429 si rate limit dépassé (anti-enumeration)', async () => {
    const limitResponse = new Response(JSON.stringify({ error: 'rate limit' }), { status: 429 });
    vi.mocked(rateLimit).mockResolvedValueOnce({ ok: false, response: limitResponse } as never);

    const POST = await importFresh();
    const res = await POST(makeReq({ orderNumber: 'SIN-48312', email: 'sophie@studio.ca' }));
    expect(res.status).toBe(429);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('400 si email invalide', async () => {
    const POST = await importFresh();
    const res = await POST(makeReq({ orderNumber: 'SIN-48312', email: 'pas-un-email' }));
    expect(res.status).toBe(400);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('400 si orderNumber trop court', async () => {
    const POST = await importFresh();
    const res = await POST(makeReq({ orderNumber: 'AB', email: 'sophie@studio.ca' }));
    expect(res.status).toBe(400);
  });

  it('fallback : trouve via id suffix si pas de match sinaliteOrderId', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);
    // Order id ends with "789012345" (last 9 chars), uppercase = "789012345"
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([baseOrder as never]);

    const POST = await importFresh();
    const res = await POST(makeReq({ orderNumber: '789012345', email: 'sophie@studio.ca' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
