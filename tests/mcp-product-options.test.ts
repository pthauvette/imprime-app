/**
 * `get_product_options` — les quantités dépendent de la VARIANTE.
 *
 * L'outil annonçait « Quantités disponibles » sans dire de quelle variante
 * elles venaient : toujours celles du 1er papier × 1re finition. Mesuré sur le
 * catalogue réel (2026-08) : flyers 100lb → 30 paliers, flyers **linen → 6**.
 * Un agent pouvait donc demander une quantité que l'outil venait d'annoncer et
 * se faire répondre « quantité indisponible » par get_print_quote.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SinaliteOption } from '@/lib/sinalite/types';

const getProductDetail = vi.fn();
const getEnrichedVariantIndex = vi.fn();

vi.mock('@/lib/sinalite/client', () => ({
  sinalite: { getProductDetail: (...a: unknown[]) => getProductDetail(...a) },
}));
vi.mock('@/lib/products/pricing', () => ({
  getEnrichedVariantIndex: (...a: unknown[]) => getEnrichedVariantIndex(...a),
}));
vi.mock('@/lib/logger', () => ({ logSinalite: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { getProductOptions, formatProductOptionsText } = await import('@/lib/mcp/tools/quote');

/** Le registre des produits virtuels est RÉEL : flyers 100lb→37, linen→41. */
const PALIERS: Record<number, number[]> = {
  37: [25, 50, 75, 100, 250, 500],  // 100lb/standard — liste riche
  41: [25, 50, 100],                // linen — liste PAUVRE, le cas du bug
};

function optionsPour(productId: number): SinaliteOption[] {
  return [
    { id: 1, group: 'size', name: '8.5 x 5.5' },
    ...(PALIERS[productId] ?? []).map((n, i) => ({ id: 100 + i, group: 'qty', name: String(n) })),
  ];
}

beforeEach(() => {
  getProductDetail.mockReset();
  getEnrichedVariantIndex.mockReset();
  getProductDetail.mockImplementation((id: number) => Promise.resolve({ options: optionsPour(id) }));
  getEnrichedVariantIndex.mockResolvedValue({
    index: new Map(), hiddenOptionIds: new Set<number>(), marginPct: 25, disabled: false, variantCount: 0,
  });
});

describe('getProductOptions', () => {
  it('sans paper/finish : quantités de la variante par défaut, NOMMÉE', async () => {
    const r = await getProductOptions('flyers');
    expect(r!.quantities).toEqual([25, 50, 75, 100, 250, 500]);
    expect(r!.quantitiesFor).toEqual({ paper: '100lb', finish: 'standard', demandee: false });
  });

  it('avec paper/finish : quantités EXACTES de cette variante', async () => {
    // Le cœur du correctif : linen n'a pas les mêmes paliers que 100lb.
    const r = await getProductOptions('flyers', 'linen', 'standard');
    expect(r!.quantities).toEqual([25, 50, 100]);
    expect(r!.quantitiesFor).toEqual({ paper: 'linen', finish: 'standard', demandee: true });
    expect(getProductDetail).toHaveBeenCalledWith(41);
  });

  it('une combinaison inconnue retombe sur le défaut sans prétendre l’avoir servie', async () => {
    const r = await getProductOptions('flyers', 'papier-inexistant', 'standard');
    expect(r!.quantitiesFor?.demandee).toBe(false);
    expect(r!.quantitiesFor?.paper).toBe('100lb');
  });

  it('produit inconnu → null', async () => {
    expect(await getProductOptions('totalement-faux')).toBeNull();
  });

  it('Sinalite injoignable → papiers/finitions quand même, quantités vides', async () => {
    getProductDetail.mockRejectedValue(new Error('502'));
    const r = await getProductOptions('flyers');
    expect(r!.papers.length).toBeGreaterThan(0);
    expect(r!.quantities).toEqual([]);
  });
});

describe('formatProductOptionsText', () => {
  it('nomme la variante et AVERTIT quand elle est le défaut', async () => {
    const txt = formatProductOptionsText((await getProductOptions('flyers'))!);
    expect(txt).toContain('Quantités pour `100lb` / `standard`');
    expect(txt).toContain('varient selon le papier et la finition');
  });

  it('n’avertit PAS quand la variante a été demandée explicitement', async () => {
    const txt = formatProductOptionsText((await getProductOptions('flyers', 'linen', 'standard'))!);
    expect(txt).toContain('Quantités pour `linen` / `standard`');
    expect(txt).not.toContain('varient selon le papier');
  });
});
