/**
 * Tests pour GET /api/admin/orders/export — CSV export pour comptabilité.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findMany: vi.fn(async () => []) },
    adminAuditEvent: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(async () => ({
    ok: true,
    user: { id: 'admin_1', email: 'admin@plio.ca' },
    userId: 'admin_1',
  })),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

function makeReq(url = 'http://localhost/api/admin/orders/export'): Request {
  return new Request(url, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    user: { id: 'admin_1', email: 'admin@plio.ca' },
    userId: 'admin_1',
  } as never);
});

describe('GET /api/admin/orders/export', () => {
  it('403 si pas admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: false,
      response: new Response('forbidden', { status: 403 }) as never,
    } as never);
    const { GET } = await import('@/app/api/admin/orders/export/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it('CSV header avec BOM UTF-8 + Content-Type + filename', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([] as never);
    const { GET } = await import('@/app/api/admin/orders/export/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="plio-orders_\d{4}-\d{2}-\d{2}.*\.csv"/);
    // Vérifie le BOM UTF-8 via les bytes (Response.text() peut le décoder
    // différemment selon l'env vitest — on check la binary directement).
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf[0]).toBe(0xEF);
    expect(buf[1]).toBe(0xBB);
    expect(buf[2]).toBe(0xBF);
    // Headers row contient les colonnes attendues
    const text = new TextDecoder('utf-8').decode(buf);
    expect(text).toContain('order_id');
    expect(text).toContain('amount_cents');
    expect(text).toContain('customer_email');
  });

  it('échappe les valeurs avec virgules/quotes/newlines', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      {
        id: 'o1', sinaliteOrderId: null, createdAt: new Date('2026-01-01'),
        paidAt: new Date('2026-01-01'), status: 'PAID',
        user: { email: 'a@b.ca' },
        productSummary: 'Cartes, "premium"', itemsCount: 1,
        subtotalCents: 1000, discountCents: 0, referralCreditAppliedCents: 0,
        shippingCents: 100, taxCents: 150, amountCents: 1250, currency: 'CAD',
        shippingMethod: 'UPS Standard', shipName: 'O\'Connell', shipCity: 'Montréal',
        shipProvince: 'QC', shipPostalCode: 'H2X 1A1',
      },
    ] as never);
    const { GET } = await import('@/app/api/admin/orders/export/route');
    const res = await GET(makeReq());
    const text = await res.text();
    // "Cartes, \"premium\"" doit être wrappé en quotes et les " doublés
    expect(text).toContain('"Cartes, ""premium"""');
  });

  it('applique le filtre status depuis query string', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([] as never);
    const { GET } = await import('@/app/api/admin/orders/export/route');
    await GET(makeReq('http://localhost/api/admin/orders/export?status=PAID,SHIPPED'));
    const args = vi.mocked(prisma.order.findMany).mock.calls[0][0];
    expect(args?.where).toMatchObject({ status: { in: ['PAID', 'SHIPPED'] } });
  });

  it('applique from/to filters', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([] as never);
    const { GET } = await import('@/app/api/admin/orders/export/route');
    await GET(makeReq('http://localhost/api/admin/orders/export?from=2026-01-01&to=2026-02-01'));
    const args = vi.mocked(prisma.order.findMany).mock.calls[0][0];
    expect(args?.where).toMatchObject({
      createdAt: { gte: new Date('2026-01-01'), lt: new Date('2026-02-01') },
    });
  });

  it('audit log appelé avec rowCount', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { id: 'o1', sinaliteOrderId: null, createdAt: new Date(), paidAt: null, status: 'PAID',
        user: { email: 'a@b.ca' }, productSummary: null, itemsCount: 1,
        subtotalCents: 100, discountCents: 0, referralCreditAppliedCents: 0,
        shippingCents: 0, taxCents: 0, amountCents: 100, currency: 'CAD',
        shippingMethod: 'UPS', shipName: 'X', shipCity: 'Mtl', shipProvince: 'QC', shipPostalCode: 'H2X 1A1' },
    ] as never);
    const { GET } = await import('@/app/api/admin/orders/export/route');
    await GET(makeReq());
    // Audit fire-and-forget — sleep micro task
    await new Promise((r) => setTimeout(r, 5));
    const auditArgs = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0]?.[0];
    expect(auditArgs?.data?.kind).toBe('ADMIN_DATA_EXPORT');
    expect(JSON.parse(auditArgs?.data?.data ?? '{}')).toMatchObject({
      action: 'ORDERS_CSV_EXPORT',
      rowCount: 1,
    });
  });
});
