import { describe, it, expect, vi, beforeEach } from 'vitest';

const { estimateShipping } = vi.hoisted(() => ({ estimateShipping: vi.fn() }));
vi.mock('@/lib/sinalite/client', () => ({ sinalite: { estimateShipping }, SinaliteError: class extends Error {} }));
// Helpers virtuels/pricing non utilisés par reestimateShipping mais importés par le module.
vi.mock('@/lib/products/virtual-products', () => ({ getVirtualProduct: vi.fn(), resolveVirtualProductId: vi.fn() }));
vi.mock('@/lib/products/pricing', () => ({ getEnrichedVariantIndex: vi.fn() }));

import { buildSinaliteOptionsMap, formatShippingText, reestimateShipping, selectShippingMethod } from './shipping';

beforeEach(() => { estimateShipping.mockReset(); });

describe('MCP estimate_shipping — helpers purs', () => {
  it('buildSinaliteOptionsMap mappe les IDs en { opt_N: id } (format Sinalite/wizard)', () => {
    expect(buildSinaliteOptionsMap([5, 30, 203])).toEqual({
      opt_0: '5',
      opt_1: '30',
      opt_2: '203',
    });
    expect(buildSinaliteOptionsMap([])).toEqual({});
  });

  it('formatShippingText liste les méthodes triées + le moins cher', () => {
    const text = formatShippingText('cartes-de-visite', 'QC', 'H2X1Y7', {
      ok: true,
      methods: [
        { carrier: 'UPS', method: 'UPS Standard', price: 12.5, days: 4, sig: 'a' },
        { carrier: 'FedEx', method: 'FedEx Express', price: 22, days: 2, sig: 'b' },
      ],
      cheapest: { carrier: 'UPS', method: 'UPS Standard', price: 12.5, days: 4, sig: 'a' },
    });
    expect(text).toContain('UPS Standard');
    expect(text).toContain('12.50 $');
    expect(text).toContain('moins cher');
    expect(text).not.toContain('undefined');
  });

  it('formatShippingText rend une erreur propre', () => {
    const text = formatShippingText('x', 'QC', 'H2X1Y7', {
      ok: false,
      reason: 'quantity_unavailable',
      message: 'Quantité 333 indisponible.',
      availableQuantities: [250, 500],
    });
    expect(text).toContain('❌');
    expect(text).toContain('250, 500');
  });
});

describe('reestimateShipping — port recalculé serveur (Mode B)', () => {
  it('mappe + trie les méthodes par prix, chacune signée', async () => {
    estimateShipping.mockResolvedValue({ body: [['FedEx', 'FedEx Express', 22, 2], ['UPS', 'UPS Standard', 16.66, 4]] });
    const r = await reestimateShipping([{ productId: 2, optionIds: [5, 30] }], 'QC', 'H2X1Y7');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.methods.map((m) => m.method)).toEqual(['UPS Standard', 'FedEx Express']); // trié par prix
    expect(r.cheapest.price).toBe(16.66);
    expect(r.methods[0].sig).toBeTruthy();
    // Vérifie qu'on a bien envoyé les items résolus à Sinalite.
    expect(estimateShipping.mock.calls[0]![0].items[0].productId).toBe(2);
  });
  it('aucun item → no_methods (sans appeler Sinalite)', async () => {
    const r = await reestimateShipping([], 'QC', 'H2X1Y7');
    expect(r.ok).toBe(false);
    expect(estimateShipping).not.toHaveBeenCalled();
  });
  it('Sinalite ne renvoie aucune méthode → no_methods', async () => {
    estimateShipping.mockResolvedValue({ body: [] });
    const r = await reestimateShipping([{ productId: 2, optionIds: [5] }], 'QC', 'H2X1Y7');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no_methods');
  });
});

describe('selectShippingMethod — Mode B prend le prix SERVEUR', () => {
  const okResult = {
    ok: true as const,
    methods: [
      { carrier: 'UPS', method: 'UPS Standard', price: 16.66, days: 4, sig: 'a' },
      { carrier: 'FedEx', method: 'FedEx Express', price: 22, days: 2, sig: 'b' },
    ],
    cheapest: { carrier: 'UPS', method: 'UPS Standard', price: 16.66, days: 4, sig: 'a' },
  };
  it('méthode trouvée → la retourne (avec son prix serveur)', () => {
    expect(selectShippingMethod(okResult, 'FedEx Express')?.price).toBe(22);
  });
  it('méthode inconnue (agent ment) → null', () => {
    expect(selectShippingMethod(okResult, 'Licorne Express')).toBeNull();
  });
  it('résultat en erreur → null', () => {
    expect(selectShippingMethod({ ok: false, reason: 'no_methods', message: 'x' }, 'UPS Standard')).toBeNull();
  });
});
