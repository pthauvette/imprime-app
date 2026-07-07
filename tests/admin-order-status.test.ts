/**
 * Tests POST /api/admin/orders/[id]/status — audit admin 2026-07 §8.2.
 *
 * Faire avancer une commande (IN_PRODUCTION/SHIPPED/DELIVERED) depuis sa fiche.
 * Couverture : gardes (401/404/statuts interdits/no-op), transition + OrderEvent
 * (tracking/carrier pour /track), audit log dédié.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(),
}));

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(async (_args: unknown) => ({})),
  eventCreate: vi.fn(async (_args: unknown) => ({})),
  tx: vi.fn(async (ops: unknown[]) => ops),
  audit: vi.fn(async (_args: unknown) => {}),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findUnique: m.findUnique, update: m.update },
    orderEvent: { create: m.eventCreate },
    $transaction: m.tx,
  },
}));
vi.mock('@/lib/db/admin-audit', () => ({
  recordAdminAudit: m.audit,
}));

import { requireAdmin } from '@/lib/admin-auth';
import { POST } from '@/app/api/admin/orders/[id]/status/route';

function adminGuard() {
  return { ok: true, userId: 'admin_1', user: { id: 'admin_1', email: 'admin@plio.ca' } };
}
function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/orders/ord_1/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: 'ord_1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(adminGuard() as never);
});

describe('POST /api/admin/orders/[id]/status', () => {
  it('401 si pas admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    const res = await POST(makeReq({ status: 'SHIPPED' }), ctx);
    expect(res.status).toBe(401);
  });

  it('404 si commande introuvable', async () => {
    m.findUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ status: 'SHIPPED' }), ctx);
    expect(res.status).toBe(404);
  });

  it.each(['PENDING', 'CANCELLED', 'FAILED', 'DELIVERED'])('400 si commande %s (pas de fulfillment à avancer)', async (status) => {
    m.findUnique.mockResolvedValue({ id: 'ord_1', status });
    const res = await POST(makeReq({ status: 'SHIPPED' }), ctx);
    expect(res.status).toBe(400);
    expect(m.tx).not.toHaveBeenCalled();
  });

  it('400 si déjà au statut demandé (no-op explicite)', async () => {
    m.findUnique.mockResolvedValue({ id: 'ord_1', status: 'SHIPPED' });
    const res = await POST(makeReq({ status: 'SHIPPED' }), ctx);
    expect(res.status).toBe(400);
  });

  it('400 si statut hors whitelist (CANCELLED refusé par Zod — passe par /cancel)', async () => {
    m.findUnique.mockResolvedValue({ id: 'ord_1', status: 'PAID' });
    const res = await POST(makeReq({ status: 'CANCELLED' }), ctx);
    expect(res.status).toBe(400);
    expect(m.tx).not.toHaveBeenCalled();
  });

  it('200 : PAID → SHIPPED avec tracking → update + OrderEvent (tracking/carrier) + audit dédié', async () => {
    m.findUnique.mockResolvedValue({ id: 'ord_1', status: 'PAID' });
    const res = await POST(makeReq({ status: 'SHIPPED', trackingNumber: '1Z999', carrier: 'UPS' }), ctx);
    expect(res.status).toBe(200);
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'ord_1' }, data: { status: 'SHIPPED' } });
    const event = m.eventCreate.mock.calls[0][0] as { data: { kind: string; data: string } };
    expect(event.data.kind).toBe('SINALITE_STATUS_CHANGED');
    const parsed = JSON.parse(event.data.data);
    expect(parsed).toMatchObject({ status: 'SHIPPED', trackingNumber: '1Z999', carrier: 'UPS', source: 'admin_single' });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'ADMIN_ORDER_STATUS_CHANGE',
      targetId: 'ord_1',
      data: expect.objectContaining({ previousStatus: 'PAID', status: 'SHIPPED' }),
    }));
  });

  it('200 : IN_PRODUCTION → DELIVERED sans tracking → event sans trackingNumber', async () => {
    m.findUnique.mockResolvedValue({ id: 'ord_1', status: 'SHIPPED' });
    const res = await POST(makeReq({ status: 'DELIVERED' }), ctx);
    expect(res.status).toBe(200);
    const parsed = JSON.parse((m.eventCreate.mock.calls[0][0] as { data: { data: string } }).data.data);
    expect(parsed.trackingNumber).toBeUndefined();
    expect(parsed.status).toBe('DELIVERED');
  });
});
