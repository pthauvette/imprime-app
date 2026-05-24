/**
 * Tests pour GET /api/account/orders/export.csv — Round 28 #2.
 *
 * Lock-in :
 *   - 401 si pas authentifié
 *   - 429 si rate-limit dépassé (anti-abuse)
 *   - Scope : where userId = session.user.id (pas de leak cross-customer)
 *   - Headers : text/csv + Content-Disposition attachment + filename
 *   - CSV : header row + data rows + UTF-8 BOM Excel-friendly
 *   - CSV escape RFC 4180 : double-quote wrap si comma/quote/newline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findMany: vi.fn() },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub };
});

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { rateLimit } from '@/lib/ratelimit';

function session() {
  return { user: { id: 'user_1', email: 'me@plio.ca', role: 'USER' } };
}

function makeReq(): Request {
  return new Request('http://localhost/api/account/orders/export', { method: 'GET' });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true } as never);
  vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
});

describe('GET /api/account/orders/export.csv (Round 28 #2)', () => {
  it('401 si non-authentifié', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const { GET } = await import('@/app/api/account/orders/export/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('429 si rate-limit dépassé', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    const limitResponse = new Response(JSON.stringify({ error: 'rate' }), { status: 429 });
    vi.mocked(rateLimit).mockResolvedValueOnce({ ok: false, response: limitResponse } as never);
    const { GET } = await import('@/app/api/account/orders/export/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
  });

  it('scope : where userId = session.user.id (pas de leak)', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    const { GET } = await import('@/app/api/account/orders/export/route');
    await GET(makeReq());
    const args = vi.mocked(prisma.order.findMany).mock.calls[0][0];
    expect(args?.where).toEqual({ userId: 'user_1' });
  });

  it('200 + headers CSV + Content-Disposition attachment', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    const { GET } = await import('@/app/api/account/orders/export/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/csv/);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="plio-mes-commandes_/);
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
  });

  it('CSV : UTF-8 BOM + header row + data rows', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'order_1',
        sinaliteOrderId: 'SIN-1',
        createdAt: new Date('2026-05-01T10:00:00Z'),
        paidAt: new Date('2026-05-01T11:00:00Z'),
        status: 'PAID',
        productSummary: 'Cartes 14pt',
        itemsCount: 1,
        subtotalCents: 5000,
        discountCents: 0,
        referralCreditAppliedCents: 0,
        walletCreditAppliedCents: 0,
        resellerDiscountCents: 0,
        shippingCents: 1200,
        taxCents: 900,
        amountCents: 7100,
        currency: 'CAD',
        shippingMethod: 'UPS Standard',
        shipName: 'Sophie',
        shipCity: 'Montréal',
        shipProvince: 'QC',
        shipPostalCode: 'H2X 1A1',
      },
    ] as never);

    const { GET } = await import('@/app/api/account/orders/export/route');
    const res = await GET(makeReq());
    // BOM check via raw bytes — Response.text() strips BOM via TextDecoder.
    const buf = new Uint8Array(await res.arrayBuffer());
    // UTF-8 BOM = EF BB BF (3 bytes)
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);

    const text = new TextDecoder('utf-8', { ignoreBOM: false }).decode(buf);
    // Header columns + data row (BOM is now leading char in decoded string)
    expect(text).toMatch(/order_id,sinalite_order_id,created_at/);
    expect(text).toContain('order_1,SIN-1,');
    expect(text).toContain('Cartes 14pt');
    expect(text).toContain('UPS Standard');
  });

  it('CSV escape : virgule dans productSummary wrapped en double-quotes', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'o2', sinaliteOrderId: null, createdAt: new Date(), paidAt: null, status: 'PAID',
        productSummary: 'Cartes, 14pt + UV', itemsCount: 1,
        subtotalCents: 0, discountCents: 0, referralCreditAppliedCents: 0,
        walletCreditAppliedCents: 0, resellerDiscountCents: 0,
        shippingCents: 0, taxCents: 0, amountCents: 0, currency: 'CAD',
        shippingMethod: 'X', shipName: 'N', shipCity: 'C', shipProvince: 'QC', shipPostalCode: 'H1H 1H1',
      },
    ] as never);

    const { GET } = await import('@/app/api/account/orders/export/route');
    const res = await GET(makeReq());
    const text = await res.text();
    expect(text).toContain('"Cartes, 14pt + UV"');
  });

  it('CSV escape : double-quote dans data → doublé + wrappé', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      {
        id: 'o3', sinaliteOrderId: null, createdAt: new Date(), paidAt: null, status: 'PAID',
        productSummary: 'Mug "Best Boss" 11oz', itemsCount: 1,
        subtotalCents: 0, discountCents: 0, referralCreditAppliedCents: 0,
        walletCreditAppliedCents: 0, resellerDiscountCents: 0,
        shippingCents: 0, taxCents: 0, amountCents: 0, currency: 'CAD',
        shippingMethod: 'X', shipName: 'N', shipCity: 'C', shipProvince: 'QC', shipPostalCode: 'H1H 1H1',
      },
    ] as never);

    const { GET } = await import('@/app/api/account/orders/export/route');
    const res = await GET(makeReq());
    const text = await res.text();
    // RFC 4180 : " → "" inside, wrap entire field in "
    expect(text).toContain('"Mug ""Best Boss"" 11oz"');
  });

  it('zero orders → CSV avec juste header + BOM (pas de crash)', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);

    const { GET } = await import('@/app/api/account/orders/export/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const text = await res.text();
    // BOM + 1 row (header) + CRLF
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});
