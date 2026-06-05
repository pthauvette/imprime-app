/**
 * Audit v3 L4 — /api/shipping/estimate : chaque méthode retournée porte une sig
 * HMAC qui VÉRIFIE le devis (contrat estimate↔create). Le round-trip crypto pur
 * est couvert par shipping-quote-token.test.ts ; ici on verrouille que la ROUTE
 * câble les bons champs (method/price/country/province/postal/productIds).
 */
import { describe, it, expect, vi } from 'vitest';
import { verifyShippingQuoteToken } from '@/lib/shipping/quote-token';

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

vi.mock('@/lib/sinalite/client', () => ({
  sinalite: {
    estimateShipping: vi.fn(async () => ({
      body: [
        ['UPS', 'UPS Standard', 14.99, 3],
        ['FedEx', 'FedEx Express', 24.99, 2],
      ],
    })),
  },
}));

function makeReq(body: unknown) {
  return new Request('http://localhost/api/shipping/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/shipping/estimate', () => {
  it('chaque méthode porte une sig qui vérifie le devis (full-cart)', async () => {
    const { POST } = await import('@/app/api/shipping/estimate/route');
    const res = await POST(
      makeReq({
        items: [
          { productId: 7, options: { opt_0: '4' } },
          { productId: 8, options: {} },
        ],
        shippingInfo: { ShipState: 'QC', ShipZip: 'H2X 1Y4', ShipCountry: 'CA' },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.methods).toHaveLength(2);

    for (const m of data.methods) {
      const ok = verifyShippingQuoteToken(
        {
          method: m.method,
          price: m.price,
          country: 'CA',
          province: 'QC',
          postal: 'H2X 1Y4',
          productIds: [7, 8], // tout le panier
        },
        m.sig,
      );
      expect(ok).toBe(true);
    }
  });

  it('une sig émise pour le panier [7,8] ne valide PAS un panier altéré', async () => {
    const { POST } = await import('@/app/api/shipping/estimate/route');
    const res = await POST(
      makeReq({
        items: [{ productId: 7, options: {} }, { productId: 8, options: {} }],
        shippingInfo: { ShipState: 'QC', ShipZip: 'H2X 1Y4', ShipCountry: 'CA' },
      }),
    );
    const m = (await res.json()).methods[0];
    // mauvais productIds ou mauvais prix → la vérif échoue (anti-tamper).
    expect(verifyShippingQuoteToken({ method: m.method, price: m.price, country: 'CA', province: 'QC', postal: 'H2X 1Y4', productIds: [7] }, m.sig)).toBe(false);
    expect(verifyShippingQuoteToken({ method: m.method, price: m.price + 1, country: 'CA', province: 'QC', postal: 'H2X 1Y4', productIds: [7, 8] }, m.sig)).toBe(false);
  });
});
