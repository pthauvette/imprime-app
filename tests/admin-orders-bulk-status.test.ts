/**
 * Tests pour POST /api/admin/orders/bulk action=markStatus.
 *
 * Couvre auth, whitelist statuses, exclusion des états terminaux,
 * createMany OrderEvent avec tracking + carrier, audit log avec bon kind.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => {
  const tx = vi.fn(async (operations: unknown[]) => operations);
  return {
    prisma: {
      order: {
        findMany: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      orderEvent: {
        createMany: vi.fn(async () => ({ count: 0 })),
      },
      adminAuditEvent: { create: vi.fn(async () => ({})) },
      user: { findUnique: vi.fn() },
      $transaction: tx,
    },
  };
});

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { auth } from '@/auth';

function adminSession() {
  return {
    user: { id: 'admin_1', email: 'admin@plio.ca', role: 'ADMIN' },
  };
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/orders/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function importPost() {
  vi.resetModules();
  return (await import('@/app/api/admin/orders/bulk/route')).POST;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/orders/bulk markStatus', () => {
  it('401 si non-authentifié', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const POST = await importPost();
    const res = await POST(makeReq({ action: 'markStatus', ids: ['o1'], status: 'SHIPPED' }));
    expect(res.status).toBe(401);
  });

  it('400 si status pas dans la whitelist (CANCELLED bloqué)', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    const POST = await importPost();
    const res = await POST(makeReq({ action: 'markStatus', ids: ['o1'], status: 'CANCELLED' }));
    expect(res.status).toBe(400);
  });

  it('200 + updateMany + OrderEvent createMany pour SHIPPED avec tracking', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { id: 'o1', status: 'IN_PRODUCTION', sinaliteOrderId: 'SIN-1' },
      { id: 'o2', status: 'PAID', sinaliteOrderId: null },
    ] as never);

    const POST = await importPost();
    const res = await POST(makeReq({
      action: 'markStatus',
      ids: ['o1', 'o2', 'o3-already-delivered'],
      status: 'SHIPPED',
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(2); // 2 éligibles (o3 exclu par où terminal)

    // findMany doit exclure DELIVERED/CANCELLED/FAILED
    const findCall = vi.mocked(prisma.order.findMany).mock.calls[0][0];
    const where = JSON.stringify(findCall?.where);
    expect(where).toContain('DELIVERED');
    expect(where).toContain('CANCELLED');
    expect(where).toContain('FAILED');

    // updateMany set status=SHIPPED sur les 2 IDs éligibles
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['o1', 'o2'] } },
      data: { status: 'SHIPPED' },
    });

    // createMany 2 events SINALITE_STATUS_CHANGED avec tracking JSON
    expect(prisma.orderEvent.createMany).toHaveBeenCalledTimes(1);
    const eventCall = vi.mocked(prisma.orderEvent.createMany).mock.calls[0][0];
    const eventData = eventCall.data as Array<{ orderId: string; kind: string; data: string }>;
    expect(eventData).toHaveLength(2);
    expect(eventData[0].kind).toBe('SINALITE_STATUS_CHANGED');
    const parsed = JSON.parse(eventData[0].data);
    expect(parsed.status).toBe('SHIPPED');
    expect(parsed.trackingNumber).toBe('1Z999AA10123456784');
    expect(parsed.carrier).toBe('UPS');
    expect(parsed.source).toBe('admin_bulk');
  });

  it('audit log kind=ADMIN_BULK_STATUS_UPDATE avec action + status', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { id: 'o1', status: 'IN_PRODUCTION', sinaliteOrderId: null },
    ] as never);

    const POST = await importPost();
    await POST(makeReq({
      action: 'markStatus',
      ids: ['o1'],
      status: 'DELIVERED',
    }));

    await new Promise((r) => setImmediate(r));
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(audit.data.kind).toBe('ADMIN_BULK_STATUS_UPDATE');
    const data = JSON.parse(audit.data.data as string);
    expect(data.action).toBe('ORDER_BULK_MARKSTATUS');
    expect(data.status).toBe('DELIVERED');
    expect(data.count).toBe(1);
  });

  it('SHIPPED sans tracking : OrderEvent.data sans trackingNumber/carrier', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { id: 'o1', status: 'IN_PRODUCTION', sinaliteOrderId: null },
    ] as never);

    const POST = await importPost();
    await POST(makeReq({ action: 'markStatus', ids: ['o1'], status: 'SHIPPED' }));

    const eventCall = vi.mocked(prisma.orderEvent.createMany).mock.calls[0][0];
    const eventData = eventCall.data as Array<{ data: string }>;
    const parsed = JSON.parse(eventData[0].data);
    expect(parsed.status).toBe('SHIPPED');
    expect(parsed.trackingNumber).toBeUndefined();
    expect(parsed.carrier).toBeUndefined();
  });

  it('400 si ids vide', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    const POST = await importPost();
    const res = await POST(makeReq({ action: 'markStatus', ids: [], status: 'SHIPPED' }));
    expect(res.status).toBe(400);
  });

  it('400 si ids > 100 (cap)', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    const POST = await importPost();
    const res = await POST(makeReq({
      action: 'markStatus',
      ids: Array.from({ length: 101 }, (_, i) => `o${i}`),
      status: 'SHIPPED',
    }));
    expect(res.status).toBe(400);
  });
});
