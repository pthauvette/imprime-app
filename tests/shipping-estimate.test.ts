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
        ['FedEx', 'FedEx Economy', 24.99, 2], // valeur RÉELLE de l'enum ShipMethod
      ],
    })),
    getProductDetail: vi.fn(async () => ({ options: [], pricing: [], metadata: [] })),
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

  it('filtre les transporteurs non supportés (Canpar) — pas de crash, UPS/FedEx conservés', async () => {
    // Régression 2026-07 : Sinalite s'est mis à renvoyer « CANPAR GROUND » (drift).
    // L'enum strict faisait échouer le parse de TOUTE la réponse → crash checkout.
    // Le pipeline create ne connaît QUE ShipMethod → on écarte Canpar, on garde le reste.
    const { sinalite } = await import('@/lib/sinalite/client');
    vi.mocked(sinalite.estimateShipping).mockResolvedValueOnce({
      body: [
        ['Canpar Shipping', 'CANPAR GROUND', 16.05, 1],
        ['UPS', 'UPS Standard', 16.32, 1],
        ['FedEx Standard Overnight', 'FedEx Standard Overnight', 20.83, 2],
      ],
    } as never);
    const { POST } = await import('@/app/api/shipping/estimate/route');
    const res = await POST(
      makeReq({
        items: [{ productId: 7, options: {} }],
        shippingInfo: { ShipState: 'QC', ShipZip: 'H2X 1Y4', ShipCountry: 'CA' },
      }),
    );
    expect(res.status).toBe(200);
    const names = (await res.json()).methods.map((m: { method: string }) => m.method);
    expect(names).not.toContain('CANPAR GROUND'); // écarté
    expect(names).toEqual(expect.arrayContaining(['UPS Standard', 'FedEx Standard Overnight']));
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

describe('finding [17] — ETA = production + transit, pas juste transit', () => {
  it("ajoute le délai de production (Turnaround sélectionné) à l'ETA, expose les segments", async () => {
    const { sinalite } = await import('@/lib/sinalite/client');
    // Turnaround "2 - 3 Business Days" (id 99), sélectionné via opt_0.
    vi.mocked(sinalite.getProductDetail).mockResolvedValueOnce({
      options: [
        { id: 99, group: 'Turnaround', name: '2 - 3 Business Days' },
        { id: 1, group: 'Stock', name: '14pt' },
      ],
      pricing: [],
      metadata: [],
    } as never);
    const { POST } = await import('@/app/api/shipping/estimate/route');
    const res = await POST(
      makeReq({
        items: [{ productId: 7, options: { opt_0: '99' } }],
        shippingInfo: { ShipState: 'QC', ShipZip: 'H2X 1Y4', ShipCountry: 'CA' },
      }),
    );
    const methods = (await res.json()).methods;
    // UPS Standard : transit 3j. Production 3j (max de la plage 2-3) + transit 3j = 6j ouvrables.
    const ups = methods.find((m: { method: string }) => m.method === 'UPS Standard');
    expect(ups.productionDays).toBe(3);
    expect(ups.transitDays).toBe(3);
    expect(ups.etaIncludesProduction).toBe(true);
  });

  it('aucun Turnaround résolu (échec Sinalite, ou libellé non reconnu) → productionDays=0, comportement historique préservé', async () => {
    const { sinalite } = await import('@/lib/sinalite/client');
    vi.mocked(sinalite.getProductDetail).mockRejectedValueOnce(new Error('timeout'));
    const { POST } = await import('@/app/api/shipping/estimate/route');
    const res = await POST(
      makeReq({
        items: [{ productId: 7, options: {} }],
        shippingInfo: { ShipState: 'QC', ShipZip: 'H2X 1Y4', ShipCountry: 'CA' },
      }),
    );
    expect(res.status).toBe(200); // jamais bloquant
    const m = (await res.json()).methods[0];
    expect(m.productionDays).toBe(0);
    expect(m.etaIncludesProduction).toBe(false);
  });

  it('panier multi-items : prend le PIRE délai de production (le colis part quand TOUT est prêt)', async () => {
    const { sinalite } = await import('@/lib/sinalite/client');
    vi.mocked(sinalite.getProductDetail)
      .mockResolvedValueOnce({
        options: [{ id: 10, group: 'Turnaround', name: 'Next Business Day' }],
        pricing: [], metadata: [],
      } as never)
      .mockResolvedValueOnce({
        options: [{ id: 20, group: 'Turnaround', name: '5 jours' }],
        pricing: [], metadata: [],
      } as never);
    const { POST } = await import('@/app/api/shipping/estimate/route');
    const res = await POST(
      makeReq({
        items: [
          { productId: 7, options: { opt_0: '10' } },
          { productId: 8, options: { opt_0: '20' } },
        ],
        shippingInfo: { ShipState: 'QC', ShipZip: 'H2X 1Y4', ShipCountry: 'CA' },
      }),
    );
    const m = (await res.json()).methods[0];
    expect(m.productionDays).toBe(5); // pas 1 — le pire des deux items
  });
});

describe('SinaliteShippingEstimateResponse — schéma tolérant (drift transporteur)', () => {
  it('parse une réponse contenant un transporteur inconnu (Canpar) SANS throw', async () => {
    // Cas 2 CloudWatch 2026-07 : sample brut de Sinalite avec Canpar en 1re ligne.
    // Avant : invalid_enum_value sur body.0.1 → SinaliteError(200) → crash checkout.
    const { SinaliteShippingEstimateResponse } = await import('@/lib/sinalite/types');
    const parsed = SinaliteShippingEstimateResponse.safeParse({
      statusCode: 200,
      body: [
        ['Canpar Shipping', 'CANPAR GROUND', 16.05, 1],
        ['UPS', 'UPS Standard', 16.32, 1],
        ['FedEx Standard Overnight', 'FedEx Standard Overnight', 20.83, 2],
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
