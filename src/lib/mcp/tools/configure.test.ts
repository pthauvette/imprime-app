import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getEnrichedVariantIndex } = vi.hoisted(() => ({ getEnrichedVariantIndex: vi.fn() }));
const { lookupVariant } = vi.hoisted(() => ({ lookupVariant: vi.fn() }));
const { getProductDetail } = vi.hoisted(() => ({ getProductDetail: vi.fn() }));
const { getPrice } = vi.hoisted(() => ({ getPrice: vi.fn() }));

vi.mock('@/lib/products/pricing', () => ({ getEnrichedVariantIndex }));
vi.mock('@/lib/sinalite/pricing', () => ({ lookupVariant }));
vi.mock('@/lib/sinalite/client', () => ({ sinalite: { getProductDetail, getPrice } }));

import { buildConfiguratorPayload } from './configure';
import { clearRemotePriceMemo } from '@/lib/products/resolve-price';

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
  // Le repli distant est mémoïsé (60 s) : sans vidage, un prix obtenu dans un
  // test précédent est resservi ici et le mock d'échec n'est jamais consulté.
  clearRemotePriceMemo();
  getProductDetail.mockResolvedValue({ options: OPTIONS });
  getEnrichedVariantIndex.mockResolvedValue({ index: new Map(), hiddenOptionIds: new Set(), marginPct: null, disabled: false, variantCount: 0 });
  // Chiffré UNIQUEMENT si le combo contient le Turnaround 41 (« 2-3 jours ») → force le défaut intelligent.
  lookupVariant.mockImplementation((ids: number[]) => (ids.includes(41) ? 21.9 : null));
});

describe('buildConfiguratorPayload — groupes d\'options + devis', () => {
  it('expose les groupes multi-choix (Faces, Coins, Délai) avec libellés FR', async () => {
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    const byKey = Object.fromEntries(p.optionGroups.map((g) => [g.key, g]));
    // `Stock` encode ici les FACES (14PT Printed 1 Side / 2 Sides) → même
    // libellé que le site. Avant, le widget disait « Faces » MÊME sur de vrais
    // groupes papier : un libellé fixe pour un groupe au sens variable.
    expect(byKey['Stock'].label).toBe('Impression recto / recto-verso');
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

  it('aucun combo dans l’index → repli distant UNIQUE, prix chiffré', async () => {
    // L'index est un cache partiel : pour des familles entières il ne contient
    // aucun palier utile. Le balayage local ne trouve rien, et sans repli le
    // configurateur MCP déclarait le produit incotable (bug 2026-08).
    lookupVariant.mockReturnValue(null);
    // Marge explicite : le prix distant est BRUT, la marge doit être appliquée
    // ICI. L'oublier ferait vendre au prix coûtant par le MCP uniquement.
    getEnrichedVariantIndex.mockResolvedValue({
      index: new Map(), hiddenOptionIds: new Set(), marginPct: 25, disabled: false, variantCount: 0,
    });
    getPrice.mockResolvedValue({ price: '80.00' });
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    expect(p.quote).toMatchObject({ ok: true, totalCad: 100 }); // 80 × 1,25
    // UNE seule fois : le balayage teste N combinaisons localement, les répliquer
    // en distant enverrait N appels facturés chez Sinalite.
    expect(getPrice).toHaveBeenCalledTimes(1);
  });

  it('aucun combo chiffré, même en distant → quote.ok false (message actionnable)', async () => {
    lookupVariant.mockReturnValue(null);
    getPrice.mockRejectedValue(new Error('502'));
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    expect(p.quote).toMatchObject({ ok: false });
    expect((p.quote as { message: string }).message).toContain('essaie');
  });

  it('le DÉFAUT est le recto-verso — même face que get_print_quote', async () => {
    // Le bloquant de la revue money-path : le balayage retenait le 1er combo
    // chiffré (= recto, Stock 20) pendant que get_print_quote/create_order
    // cotaient le recto-verso (Stock 21). Le widget affichait « Recto · X $ »,
    // puis create_order — qui ne reçoit AUCUN optionId et re-résout seul —
    // facturait le recto-verso. Prix vu ≠ prix payé.
    const p2 = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    const stock = p2.optionGroups.find((g) => g.key === 'Stock');
    expect(stock!.selectedId).toBe(21); // recto-verso, pas 20
    expect(p2.selection!.options).toContain(21);
    expect(p2.selection!.options).not.toContain(20);
  });

  it('un groupe ENTIÈREMENT masqué → refus, rien ne part chez Sinalite', async () => {
    // Sans cette garde, le groupe disparaît, la combinaison sort incomplète,
    // et le repli distant la fait chiffrer quand même : Plio cotait une
    // configuration amputée d'un groupe entier, puis la transmettait à la
    // production.
    getEnrichedVariantIndex.mockResolvedValue({
      index: new Map(), hiddenOptionIds: new Set([20, 21]), marginPct: 25, disabled: false, variantCount: 0,
    });
    const p2 = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    expect(p2.quote).toMatchObject({ ok: false });
    expect(getPrice).not.toHaveBeenCalled();
  });

  it('produit désactivé par l’admin → refus explicite, aucun prix', async () => {
    // Sans cette garde, l'index renvoyé est BRUT (sans marge) : le
    // configurateur MCP exposait les produits cachés au prix coûtant.
    getEnrichedVariantIndex.mockResolvedValue({
      index: new Map(), hiddenOptionIds: new Set(), marginPct: null, disabled: true, variantCount: 0,
    });
    const p = await buildConfiguratorPayload({ slug: 'cartes-de-visite' });
    expect(p.quote).toMatchObject({ ok: false });
    expect((p.quote as { message: string }).message).toContain('indisponible');
    expect(p.optionGroups).toEqual([]);
    expect(getPrice).not.toHaveBeenCalled();
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
