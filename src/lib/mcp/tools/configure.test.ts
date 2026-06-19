import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getEnrichedVariantIndex } = vi.hoisted(() => ({ getEnrichedVariantIndex: vi.fn() }));
const { lookupVariant } = vi.hoisted(() => ({ lookupVariant: vi.fn() }));
const { getProductDetail } = vi.hoisted(() => ({ getProductDetail: vi.fn() }));

vi.mock('@/lib/products/pricing', () => ({ getEnrichedVariantIndex }));
vi.mock('@/lib/sinalite/pricing', () => ({ lookupVariant }));
vi.mock('@/lib/sinalite/client', () => ({ sinalite: { getProductDetail } }));

import { buildConfiguratorPayload } from './configure';

// Options réalistes d'une carte (groupes : size, qty, Stock=faces, Round Corners, Turnaround, Coating).
const OPTIONS = [
  { id: 1, group: 'size', name: '3.5 x 2' },
  { id: 10, group: 'qty', name: '250' }, { id: 11, group: 'qty', name: '500' }, { id: 12, group: 'qty', name: '1000' },
  { id: 20, group: 'Stock', name: '14PT Printed 1 Side (4/0)' }, { id: 21, group: 'Stock', name: '14PT Printed 2 Sides (4/4)' },
  { id: 30, group: 'Round Corners', name: 'NO' }, { id: 31, group: 'Round Corners', name: 'YES' },
  { id: 40, group: 'Turnaround', name: 'Next Business Day' }, { id: 41, group: 'Turnaround', name: '2 - 3 Business Days' },
  { id: 50, group: 'Coating', name: 'No Coating' },
];

beforeEach(() => {
  vi.clearAllMocks();
  getProductDetail.mockResolvedValue({ options: OPTIONS });
  getEnrichedVariantIndex.mockResolvedValue({ index: new Map(), hiddenOptionIds: new Set(), marginPct: null, disabled: false, variantCount: 0 });
  // Chiffré UNIQUEMENT si le combo contient le Turnaround 41 (« 2-3 jours ») → force le défaut intelligent.
  lookupVariant.mockImplementation((ids: number[]) => (ids.includes(41) ? 21.9 : null));
});

describe('buildConfiguratorPayload — groupes d\'options + devis', () => {
  it('expose les groupes multi-choix (Faces, Coins, Délai) avec libellés FR', async () => {
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    const byKey = Object.fromEntries(p.optionGroups.map((g) => [g.key, g]));
    expect(byKey['Stock'].label).toBe('Faces');
    expect(byKey['Stock'].options.map((o) => o.label)).toEqual(['Recto (1 face)', 'Recto-verso (2 faces)']);
    expect(byKey['Round Corners'].label).toBe('Coins');
    expect(byKey['Round Corners'].options.map((o) => o.label)).toEqual(['Carrés', 'Coins arrondis']);
    expect(byKey['Turnaround'].label).toBe('Délai');
    // size (1 option) et Coating (1 option) ne sont PAS présentés.
    expect(byKey['size']).toBeUndefined();
    expect(byKey['Coating']).toBeUndefined();
  });

  it('défaut INTELLIGENT : le 1er-de-chaque (Turnaround 40) n\'est pas chiffré → balaye → trouve 41', async () => {
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    expect(p.quote).toMatchObject({ ok: true, totalCad: 21.9 });
    // Le Turnaround sélectionné est 41 (le combo chiffré), pas 40 (le 1er brut).
    const turn = p.optionGroups.find((g) => g.key === 'Turnaround');
    expect(turn!.selectedId).toBe(41);
    expect(p.selection!.options).toContain(41);
  });

  it('sélection EXPLICITE (recto-verso = Stock 21) → respectée + chiffrée', async () => {
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite', options: [21] });
    const stock = p.optionGroups.find((g) => g.key === 'Stock');
    expect(stock!.selectedId).toBe(21); // recto-verso imposé
    expect(p.selection!.options).toContain(21);
    expect(p.quote).toMatchObject({ ok: true }); // Turnaround 41 trouvé par défaut intelligent
  });

  it('aucun combo chiffré → quote.ok false (message actionnable)', async () => {
    lookupVariant.mockReturnValue(null);
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    expect(p.quote).toMatchObject({ ok: false });
    expect((p.quote as { message: string }).message).toContain('essaie');
  });

  it('quantités = celles du PRODUIT (groupe qty), pas un représentatif', async () => {
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    expect(p.selected!.quantities).toEqual([250, 500, 1000]);
    expect(p.selection!.quantity).toBe(500); // défaut préféré dispo
  });

  it('produit inconnu → selected null + erreur, products présents', async () => {
    const p = await buildConfiguratorPayload({ slug: 'totally-fake' });
    expect(p.selected).toBeNull();
    expect(p.quote).toMatchObject({ ok: false });
    expect(p.products.length).toBeGreaterThan(0);
    expect(getProductDetail).not.toHaveBeenCalled();
  });

  it('Sinalite down → dégrade (papiers, pas de groupes/prix, jamais throw)', async () => {
    getProductDetail.mockRejectedValue(new Error('Sinalite down'));
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    expect(p.selected).not.toBeNull();
    expect(p.optionGroups).toEqual([]);
    expect(p.quote).toMatchObject({ ok: false });
  });
});
