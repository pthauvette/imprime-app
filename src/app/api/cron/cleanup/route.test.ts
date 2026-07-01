import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  requireCronAuth: vi.fn(() => null), // autorisé
  draftDeleteMany: vi.fn(),
  designDeleteMany: vi.fn(),
  orderUpdateMany: vi.fn(),
  orderFindMany: vi.fn(),
  intentDeleteMany: vi.fn(),
  intentFindMany: vi.fn(),
  intentUpdateMany: vi.fn(),
  cleanupOldCronRuns: vi.fn(async () => 0),
  recordCronRun: vi.fn(),
  pingCronHealthcheck: vi.fn(),
  releaseReservedCreditsOnCancel: vi.fn(),
}));
vi.mock('@/lib/cron/auth', () => ({ requireCronAuth: m.requireCronAuth }));
vi.mock('@/lib/db', () => ({ prisma: {
  draft: { deleteMany: m.draftDeleteMany },
  designDraft: { deleteMany: m.designDeleteMany },
  order: { updateMany: m.orderUpdateMany, findMany: m.orderFindMany },
  mcpOrderIntent: { deleteMany: m.intentDeleteMany, findMany: m.intentFindMany, updateMany: m.intentUpdateMany },
} }));
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: m.pingCronHealthcheck }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: m.recordCronRun, cleanupOldCronRuns: m.cleanupOldCronRuns }));
vi.mock('@/lib/orders/credit-reservation', () => ({ releaseReservedCreditsOnCancel: m.releaseReservedCreditsOnCancel }));

import { GET } from './route';
import { NextRequest } from 'next/server';

const req = () => new NextRequest('http://localhost/api/cron/cleanup', { headers: { authorization: 'Bearer x' } });

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCronAuth.mockReturnValue(null);
  m.draftDeleteMany.mockResolvedValue({ count: 0 });
  m.designDeleteMany.mockResolvedValue({ count: 0 });
  m.orderUpdateMany.mockResolvedValue({ count: 2 });
  m.intentDeleteMany.mockResolvedValue({ count: 1 });
  m.intentUpdateMany.mockResolvedValue({ count: 1 });
  m.intentFindMany.mockResolvedValue([]);
  m.orderFindMany.mockResolvedValue([]);
  m.cleanupOldCronRuns.mockResolvedValue(0);
  m.releaseReservedCreditsOnCancel.mockResolvedValue({ released: false, walletCents: 0, referralCents: 0 });
});

describe('cron/cleanup — nettoyage Mode B (#3c)', () => {
  it('M2/M3 — libère (annule + restaure crédits) les Orders mcp_ PENDING > 2h ET web PENDING > 24h', async () => {
    // 1er findMany = filtre mcp_ ; 2e = filtre web (not mcp_). Per-order release.
    m.orderFindMany.mockResolvedValueOnce([{ id: 'oMcp' }]).mockResolvedValueOnce([{ id: 'oWeb' }]);
    m.releaseReservedCreditsOnCancel.mockResolvedValue({ released: true, walletCents: 0, referralCents: 0 });
    await GET(req());
    expect(m.orderFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ paymentIntentId: { startsWith: 'mcp_' }, status: 'PENDING' }),
    }));
    expect(m.orderFindMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ paymentIntentId: { not: { startsWith: 'mcp_' } }, status: { in: ['PENDING', 'FAILED'] } }),
    }));
    expect(m.releaseReservedCreditsOnCancel).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'oMcp' }));
    expect(m.releaseReservedCreditsOnCancel).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'oWeb' }));
  });

  it('supprime les claims success=false SANS Order (poisoned, sûr)', async () => {
    await GET(req());
    expect(m.intentDeleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ success: false, orderId: null }),
    }));
  });

  it('SÉCURITÉ : claim d\'Order PAYÉE → success=true (jamais delete → pas de double commande) ; claim d\'Order CANCELLED → delete', async () => {
    m.intentFindMany.mockResolvedValue([
      { id: 'cPaid', orderId: 'oPaid' },
      { id: 'cCancelled', orderId: 'oCancelled' },
    ]);
    // orderFindMany : call 1 (release mcp)=[], call 2 (release web)=[], call 3 (claim check)=[…].
    m.orderFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'oPaid', status: 'PAID' },
        { id: 'oCancelled', status: 'CANCELLED' },
      ]);
    const res = await GET(req());
    const body = await res.json();

    // L'Order PAYÉE : claim marqué success=true, JAMAIS supprimé.
    expect(m.intentUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['cPaid'] } }, data: { success: true } });
    // L'Order CANCELLED : claim supprimé (libère un retry propre).
    const deleteCalls = m.intentDeleteMany.mock.calls.map((c) => c[0]);
    expect(deleteCalls).toContainEqual(expect.objectContaining({ where: { id: { in: ['cCancelled'] } } }));
    expect(body.mcp.claimsResolvedPaid).toBe(1);
  });

  it('refuse si auth cron échoue', async () => {
    const denied = new Response('no', { status: 401 });
    m.requireCronAuth.mockReturnValue(denied as never);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(m.orderFindMany).not.toHaveBeenCalled();
  });
});
