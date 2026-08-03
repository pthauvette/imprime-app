/**
 * `get_print_quote` — orchestration (Sinalite + index enrichi mockés).
 *
 * Verrouille les deux trous trouvés en 2026-08, tous deux invisibles en
 * relisant le code : le devis refusait ce que le checkout facture, et cotait
 * les produits masqués au prix coûtant. Le registre des produits virtuels est
 * RÉEL (pas de mock) — c'est lui qui fait le lien slug → productId Sinalite.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SinaliteOption } from '@/lib/sinalite/types';

const getProductDetail = vi.fn();
const getPrice = vi.fn();
const getEnrichedVariantIndex = vi.fn();

vi.mock('@/lib/sinalite/client', () => ({
  sinalite: {
    getProductDetail: (...a: unknown[]) => getProductDetail(...a),
    getPrice: (...a: unknown[]) => getPrice(...a),
  },
}));
vi.mock('@/lib/products/pricing', () => ({
  getEnrichedVariantIndex: (...a: unknown[]) => getEnrichedVariantIndex(...a),
}));
vi.mock('@/lib/logger', () => ({
  logSinalite: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { getPrintQuote } = await import('@/lib/mcp/tools/quote');
const { clearRemotePriceMemo } = await import('@/lib/products/resolve-price');

/** Options minimales d'un flyer : un format, un stock, et des paliers de qty. */
const OPTIONS: SinaliteOption[] = [
  { id: 35, group: 'size', name: '8.5 x 5.5' },
  // Deux faces : c'est la forme RÉELLE du produit 37 — le groupe `Stock`
  // encode ici recto/recto-verso, pas le papier.
  { id: 91, group: 'Stock', name: '100LB Gloss Text Printed 1 Side (4/0)' },
  { id: 92, group: 'Stock', name: '100LB Gloss Text Printed 2 Sides (4/4)' },
  { id: 12, group: 'qty', name: '500' },
  { id: 13, group: 'qty', name: '750' },
];

/** L'index ne couvre QUE 750 — exactement la forme du bug : les paliers
 *  utiles (500) sont hors index et doivent partir en repli distant. */
const INDEX_PARTIEL = new Map<string, number>([['13-35-92', 90]]);

beforeEach(() => {
  // Le repli distant est mémoïsé : sans vidage, le prix d'un test précédent
  // est resservi et le mock d'échec n'est jamais consulté.
  clearRemotePriceMemo();
  getProductDetail.mockReset();
  getPrice.mockReset();
  getEnrichedVariantIndex.mockReset();
  getProductDetail.mockResolvedValue({ options: OPTIONS });
  getEnrichedVariantIndex.mockResolvedValue({
    index: INDEX_PARTIEL,
    hiddenOptionIds: new Set<number>(),
    marginPct: 25,
    disabled: false,
    variantCount: 1,
  });
});

describe('getPrintQuote', () => {
  it('cote une quantité ABSENTE de l’index via le repli distant', async () => {
    // Le bug rapporté : ici le devis renvoyait « prix indisponible » alors que
    // le site et le checkout tarifent la même combinaison.
    getPrice.mockResolvedValue({ price: '53.92' });
    const r = await getPrintQuote('flyers', '100lb', 'standard', 500);
    expect(r).toMatchObject({ ok: true, productId: 37, quantity: 500, totalCad: 67.4 });
    expect(getPrice).toHaveBeenCalledWith(37, expect.arrayContaining([12, 35, 92]));
  });

  it('n’appelle pas Sinalite quand l’index suffit', async () => {
    const r = await getPrintQuote('flyers', '100lb', 'standard', 750);
    expect(r).toMatchObject({ ok: true, totalCad: 90 });
    expect(getPrice).not.toHaveBeenCalled();
  });

  it('REFUSE de coter un produit désactivé par l’admin', async () => {
    // Sans cette garde, `getEnrichedVariantIndex` renvoie l'index BRUT
    // (marginPct null) et le devis sortait le PRIX COÛTANT : sous-cotation +
    // fuite de la base de coûts, pour une commande que le checkout rejette.
    getEnrichedVariantIndex.mockResolvedValue({
      index: new Map([['12-35-92', 53.92]]), // brut, sans marge
      hiddenOptionIds: new Set<number>(),
      marginPct: null,
      disabled: true,
      variantCount: 1,
    });
    const r = await getPrintQuote('flyers', '100lb', 'standard', 500);
    expect(r).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(getPrice).not.toHaveBeenCalled();
  });

  it('distingue « quantité inexistante » de « prix introuvable »', async () => {
    // Une quantité hors catalogue ne doit PAS partir chez Sinalite : elle n'a
    // pas d'option id, la demande serait forgée.
    const r = await getPrintQuote('flyers', '100lb', 'standard', 333);
    expect(r).toMatchObject({ ok: false, reason: 'quantity_unavailable' });
    expect(r.ok === false && r.availableQuantities).toEqual([500, 750]);
    expect(getPrice).not.toHaveBeenCalled();
  });

  it('reste en échec propre si le repli distant tombe', async () => {
    getPrice.mockRejectedValue(new Error('502'));
    const r = await getPrintQuote('flyers', '100lb', 'standard', 500);
    expect(r).toMatchObject({ ok: false, reason: 'price_unavailable' });
  });
});
