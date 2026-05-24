/**
 * Tests PATCH /api/orders/[id]/shipping — Round 32.
 *
 * Lock-in :
 *   - 401 si pas authentifié
 *   - 404 si order pas trouvé OU pas owner (no info leak)
 *   - 409 si status != PAID (déjà soumis ou pas confirmé)
 *   - 400 si shipPostalCode invalide
 *   - 200 + sinalitePayload.shipping mis à jour si tout OK
 *   - OrderEvent SHIPPING_MODIFIED créé avec before/after
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findUnique: vi.fn(), update: vi.fn() },
    orderEvent: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, debug: noop, fatal: noop } };
});

import { auth } from '@/auth';
import { prisma } from '@/lib/db';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/orders/o_test/shipping', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ORDER_BASE = {
  id: 'o_test',
  userId: 'u_owner',
  status: 'PAID' as const,
  shipName: 'Old Name',
  shipLine1: '123 Old St',
  shipLine2: null,
  shipCity: 'Montreal',
  shipPostalCode: 'H1A 1A1',
  shipPhone: '+15145550000',
  sinalitePayload: JSON.stringify({
    items: [{ productId: 1 }],
    shipping: { name: 'Old Name', address: '123 Old St', city: 'Montreal' },
  }),
};

const VALID_BODY = {
  shipName: 'Patrick Thauvette',
  shipLine1: '456 New Ave',
  shipLine2: 'Suite 200',
  shipCity: 'Laval',
  shipPostalCode: 'H7A 2B2',
  shipPhone: '+14385551234',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: 'u_owner', email: 'p@plio.ca' },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as never);
  vi.mocked(prisma.order.findUnique).mockResolvedValue(ORDER_BASE as never);
  vi.mocked(prisma.order.update).mockResolvedValue({} as never);
  vi.mocked(prisma.orderEvent.create).mockResolvedValue({} as never);
});

describe('PATCH /api/orders/[id]/shipping (Round 32)', () => {
  it('401 si pas authentifié', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const { PATCH } = await import('@/app/api/orders/[id]/shipping/route');
    const res = await PATCH(makeReq(VALID_BODY) as never, { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(401);
  });

  it('404 si order pas trouvé', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/orders/[id]/shipping/route');
    const res = await PATCH(makeReq(VALID_BODY) as never, { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(404);
  });

  it('404 si pas owner (no info leak)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...ORDER_BASE, userId: 'u_other' } as never);
    const { PATCH } = await import('@/app/api/orders/[id]/shipping/route');
    const res = await PATCH(makeReq(VALID_BODY) as never, { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(404); // Pas 403 : on simule "not found"
  });

  it('409 si status != PAID (SUBMITTED → trop tard)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...ORDER_BASE, status: 'SUBMITTED' } as never);
    const { PATCH } = await import('@/app/api/orders/[id]/shipping/route');
    const res = await PATCH(makeReq(VALID_BODY) as never, { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('STATUS_LOCKED');
    expect(json.currentStatus).toBe('SUBMITTED');
  });

  it('409 si status PENDING (pas encore confirmé)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...ORDER_BASE, status: 'PENDING' } as never);
    const { PATCH } = await import('@/app/api/orders/[id]/shipping/route');
    const res = await PATCH(makeReq(VALID_BODY) as never, { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/pas encore confirmée/);
  });

  it('400 si shipPostalCode pas format CA', async () => {
    const { PATCH } = await import('@/app/api/orders/[id]/shipping/route');
    const res = await PATCH(
      makeReq({ ...VALID_BODY, shipPostalCode: '90210' }) as never,
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(400);
  });

  it('400 si shipName trop court', async () => {
    const { PATCH } = await import('@/app/api/orders/[id]/shipping/route');
    const res = await PATCH(
      makeReq({ ...VALID_BODY, shipName: 'X' }) as never,
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(400);
  });

  it('200 + update Order + create OrderEvent SHIPPING_MODIFIED', async () => {
    const { PATCH } = await import('@/app/api/orders/[id]/shipping/route');
    const res = await PATCH(makeReq(VALID_BODY) as never, { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(200);
    expect(prisma.order.update).toHaveBeenCalledOnce();
    expect(prisma.orderEvent.create).toHaveBeenCalledOnce();

    const evArgs = vi.mocked(prisma.orderEvent.create).mock.calls[0]![0];
    expect(evArgs?.data.kind).toBe('SHIPPING_MODIFIED');
    const evData = JSON.parse(evArgs?.data.data as string);
    expect(evData.actor).toBe('customer');
    expect(evData.before.line1).toBe('123 Old St');
    expect(evData.after.line1).toBe('456 New Ave');
  });

  it('200 + sinalitePayload.shipping mis à jour avec la nouvelle adresse', async () => {
    const { PATCH } = await import('@/app/api/orders/[id]/shipping/route');
    await PATCH(makeReq(VALID_BODY) as never, { params: Promise.resolve({ id: 'o_test' }) });

    const orderArgs = vi.mocked(prisma.order.update).mock.calls[0]![0];
    const updatedPayload = JSON.parse(orderArgs.data.sinalitePayload as string);
    expect(updatedPayload.shipping.name).toBe('Patrick Thauvette');
    expect(updatedPayload.shipping.address).toBe('456 New Ave');
    expect(updatedPayload.shipping.city).toBe('Laval');
    expect(updatedPayload.shipping.postalCode).toBe('H7A 2B2');
    // Items array préservé (on touche que shipping)
    expect(updatedPayload.items).toEqual([{ productId: 1 }]);
  });

  it('shipPostalCode normalisé (uppercase + 1 space middle)', async () => {
    const { PATCH } = await import('@/app/api/orders/[id]/shipping/route');
    await PATCH(
      makeReq({ ...VALID_BODY, shipPostalCode: 'h7a2b2' }) as never,
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    const orderArgs = vi.mocked(prisma.order.update).mock.calls[0]![0];
    expect(orderArgs.data.shipPostalCode).toBe('H7A 2B2');
  });
});
