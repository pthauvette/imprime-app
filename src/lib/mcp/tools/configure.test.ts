import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getProductOptions, getPrintQuote } = vi.hoisted(() => ({
  getProductOptions: vi.fn(),
  getPrintQuote: vi.fn(),
}));
vi.mock('@/lib/mcp/tools/quote', () => ({ getProductOptions, getPrintQuote }));

import { buildConfiguratorPayload } from './configure';

const OPTIONS = {
  slug: 'cartes-de-visite',
  name: 'Cartes de visite',
  papers: [
    { key: '14pt', label: '14 pt', description: '', finishes: [{ key: 'matte', label: 'Mate' }, { key: 'aq', label: 'Aqueuse' }] },
    { key: '16pt', label: '16 pt', description: '', finishes: [{ key: 'aq', label: 'Aqueuse' }] },
  ],
  quantities: [250, 500, 1000],
};

beforeEach(() => {
  vi.clearAllMocks();
  getProductOptions.mockResolvedValue(OPTIONS);
  getPrintQuote.mockResolvedValue({ ok: true, productId: 1, quantity: 500, totalCad: 21.9, unitPriceCad: 0.0438 });
});

describe('buildConfiguratorPayload', () => {
  it('défauts appliqués (1er papier, 1re finition du papier, 500) + devis', async () => {
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    expect(p.selection).toMatchObject({ slug: 'cartes-de-visite', paper: '14pt', finish: 'matte', quantity: 500 });
    expect(p.quote).toEqual({ ok: true, totalCad: 21.9, unitPriceCad: 0.0438, quantity: 500 });
    expect(getPrintQuote).toHaveBeenCalledWith('cartes-de-visite', '14pt', 'matte', 500);
    expect(p.selected).toMatchObject({ slug: 'cartes-de-visite', name: 'Cartes de visite' });
  });

  it('slug absent → 1er produit du catalogue', async () => {
    const p = await buildConfiguratorPayload({});
    expect(p.products.length).toBeGreaterThan(0);
    expect(p.selection!.slug).toBe(p.products[0].slug);
  });

  it('finition invalide pour le papier → 1re finition du papier (16pt n\'a que aq)', async () => {
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite', paper: '16pt', finish: 'matte' });
    expect(p.selection!.paper).toBe('16pt');
    expect(p.selection!.finish).toBe('aq');
  });

  it('quantité hors liste → 500 si disponible', async () => {
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite', quantity: 999 });
    expect(p.selection!.quantity).toBe(500);
  });

  it('produit inconnu → selected null + quote.ok false, mais products présents (fallback dropdown)', async () => {
    getProductOptions.mockResolvedValue(null);
    const p = await buildConfiguratorPayload({ slug: 'totally-fake' });
    expect(p.selected).toBeNull();
    expect(p.selection).toBeNull();
    expect(p.quote).toMatchObject({ ok: false });
    expect(p.products.length).toBeGreaterThan(0);
    expect(getPrintQuote).not.toHaveBeenCalled();
  });

  it('devis indisponible → quote.ok false propagé (selection conservée)', async () => {
    getPrintQuote.mockResolvedValue({ ok: false, reason: 'price_unavailable', message: 'Prix indisponible.' });
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    expect(p.selection).not.toBeNull();
    expect(p.quote).toMatchObject({ ok: false, message: 'Prix indisponible.' });
  });
});
