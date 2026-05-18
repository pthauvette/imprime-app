/**
 * Tests pour l'export XLSX finances /api/admin/finances/export.
 *
 * On vérifie :
 *   - Auth ADMIN required (401/403)
 *   - Génère un vrai XLSX (signature ZIP "PK")
 *   - Multi-sheet : 4 sheets (Aperçu, Commandes, Par jour, Par province)
 *   - Filename + Content-Type corrects
 *   - Audit log enregistré avec kind=ADMIN_DATA_EXPORT
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    adminAuditEvent: { create: vi.fn(async () => ({})) },
    user: { findUnique: vi.fn() },
    order: { findMany: vi.fn() },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import ExcelJS from 'exceljs';

function adminSession() {
  return {
    user: { id: 'admin_1', email: 'admin@plio.ca', role: 'ADMIN' },
  };
}

function makeReq(query = ''): Request {
  return new Request(`http://localhost/api/admin/finances/export${query}`);
}

async function importFresh() {
  vi.resetModules();
  return (await import('@/app/api/admin/finances/export/route')).GET;
}

const baseOrder = {
  id: 'order_1',
  sinaliteOrderId: 'SIN-1',
  status: 'DELIVERED',
  paidAt: new Date('2026-05-15T12:00:00Z'),
  amountCents: 10522,
  subtotalCents: 7900,
  shippingCents: 1250,
  taxCents: 1372,
  discountCents: 0,
  referralCreditAppliedCents: 0,
  itemsCount: 500,
  productSummary: 'Cartes 14pt',
  shipProvince: 'QC',
  shipCity: 'Montréal',
  shippingMethod: 'Standard',
  user: { email: 'sophie@studio.ca', name: 'Sophie Beauchamp' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/finances/export', () => {
  it('401 si non-authentifié', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const GET = await importFresh();
    const res = await GET(makeReq());

    expect(res.status).toBe(401);
  });

  it('403 si user non-admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', email: 'u@plio.ca', role: 'USER' },
    } as never);

    const GET = await importFresh();
    const res = await GET(makeReq());

    expect(res.status).toBe(403);
  });

  it('200 + XLSX binaire valide + 4 sheets', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([baseOrder, {
      ...baseOrder,
      id: 'order_2',
      shipProvince: 'ON',
      paidAt: new Date('2026-05-16T10:00:00Z'),
    }] as never);

    const GET = await importFresh();
    const res = await GET(makeReq('?period=30d'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml');
    expect(res.headers.get('Content-Disposition')).toMatch(/filename="plio-finances-30d-/);

    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(1000);
    // ZIP signature : "PK" (XLSX is a ZIP container)
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K

    // Re-parse pour confirmer la structure
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(sheetNames).toEqual(['Aperçu', 'Commandes', 'Par jour', 'Par province']);
    // Aperçu doit contenir 11 lignes data + header
    expect(wb.getWorksheet('Aperçu')?.rowCount).toBeGreaterThanOrEqual(10);
    // Commandes : 2 orders + header
    expect(wb.getWorksheet('Commandes')?.rowCount).toBe(3);
  });

  it('audit log avec kind=ADMIN_DATA_EXPORT + action=FINANCES_XLSX_EXPORT', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([baseOrder] as never);

    const GET = await importFresh();
    await GET(makeReq('?period=7d'));

    // Wait a microtask : the audit call is `void` (fire-and-forget)
    await new Promise((r) => setImmediate(r));

    expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(audit.data.kind).toBe('ADMIN_DATA_EXPORT');
    const data = JSON.parse(audit.data.data as string);
    expect(data.action).toBe('FINANCES_XLSX_EXPORT');
    expect(data.period).toBe('7d');
    expect(data.ordersCount).toBe(1);
  });

  it('défaut period=30d si absent ou invalide', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);

    const GET = await importFresh();
    const res = await GET(makeReq('?period=garbage'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/plio-finances-30d-/);
  });
});
