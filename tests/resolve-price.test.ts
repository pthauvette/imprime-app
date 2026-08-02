/**
 * Repli de prix MCP — index local puis Sinalite.
 *
 * Les tests visent ce qui doit être IMPOSSIBLE plutôt que le chemin heureux :
 * un devis qui diverge d'un cent du checkout déclenche un PRICE_MISMATCH, et
 * un prix deviné se retrouve dans une commande.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPrice = vi.fn();

vi.mock('@/lib/sinalite/client', () => ({
  sinalite: { getPrice: (...a: unknown[]) => getPrice(...a) },
}));
vi.mock('@/lib/logger', () => ({
  logSinalite: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { resolveVariantPrice, clearRemotePriceMemo } = await import('@/lib/products/resolve-price');

/** L'index porte DÉJÀ la marge (cf. getEnrichedVariantIndex). */
const ctx = (
  entries: [string, number][],
  marginPct: number | null,
  extra: { disabled?: boolean; hidden?: number[] } = {},
) => ({
  index: new Map(entries),
  marginPct,
  hiddenOptionIds: new Set(extra.hidden ?? []),
  disabled: extra.disabled ?? false,
  variantCount: entries.length,
});

beforeEach(() => {
  getPrice.mockReset();
  clearRemotePriceMemo(); // sinon un prix mémoïsé fuit d'un test à l'autre
});

describe('resolveVariantPrice', () => {
  it('sert le prix de l’index sans appeler Sinalite', async () => {
    const p = await resolveVariantPrice(37, [12, 18], ctx([['12-18', 67.4]], 25));
    expect(p).toBe(67.4);
    expect(getPrice).not.toHaveBeenCalled();
  });

  it('n’applique PAS la marge deux fois sur un prix d’index', async () => {
    // Régression la plus coûteuse du repli : l'index est déjà marké. Re-marker
    // ferait payer 25 % de trop au client via le MCP, et seulement là.
    const p = await resolveVariantPrice(37, [12, 18], ctx([['12-18', 100]], 25));
    expect(p).toBe(100);
  });

  it('replie sur Sinalite quand la combinaison manque à l’index', async () => {
    getPrice.mockResolvedValue({ price: '80.00' });
    const p = await resolveVariantPrice(37, [12, 18], ctx([], 25));
    expect(getPrice).toHaveBeenCalledWith(37, [12, 18]);
    expect(p).toBe(100); // 80 × 1,25
  });

  it('applique au prix distant l’arrondi EXACT du checkout', async () => {
    // price-order.ts : Math.round(raw * multiplier * 100) / 100. Tout autre
    // arrondi ferait diverger le devis du montant recalculé au checkout.
    getPrice.mockResolvedValue({ price: '10.007' });
    const p = await resolveVariantPrice(1, [1], ctx([], 10));
    expect(p).toBe(Math.round(10.007 * 1.1 * 100) / 100);
  });

  it('sans marge configurée, ne majore pas le prix distant', async () => {
    getPrice.mockResolvedValue({ price: '42.50' });
    expect(await resolveVariantPrice(1, [1], ctx([], null))).toBe(42.5);
  });

  it.each([['0'], ['-5'], ['abc'], ['']])(
    'refuse un prix distant absurde (%s) plutôt que de coter 0,00 $',
    async (bogus) => {
      getPrice.mockResolvedValue({ price: bogus });
      expect(await resolveVariantPrice(1, [1], ctx([], 20))).toBeNull();
    },
  );

  it('REFUSE un produit désactivé, même si l’index contient un prix', async () => {
    // En production, marginPct === null est IMPOSSIBLE autrement que pour un
    // produit désactivé (resolveDefaultMarginPct throw sinon) : sans cette
    // garde DANS le helper, servir cet index revient à vendre au prix coûtant.
    const p = await resolveVariantPrice(37, [12, 18], ctx([['12-18', 53.92]], null, { disabled: true }));
    expect(p).toBeNull();
    expect(getPrice).not.toHaveBeenCalled();
  });

  it('REFUSE une option masquée par l’admin plutôt que de la faire chiffrer', async () => {
    getPrice.mockResolvedValue({ price: '80.00' });
    const p = await resolveVariantPrice(37, [12, 18], ctx([], 25, { hidden: [18] }));
    expect(p).toBeNull();
    expect(getPrice).not.toHaveBeenCalled();
  });

  it.each([[0], [41]])('REFUSE une liste d’options de taille %i', async (n) => {
    getPrice.mockResolvedValue({ price: '80.00' });
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    expect(await resolveVariantPrice(37, ids, ctx([], 25))).toBeNull();
    expect(getPrice).not.toHaveBeenCalled();
  });

  it('mémoïse le repli : deux devis identiques = UN seul appel facturé', async () => {
    // get_print_quote est PUBLIC et sans auth. Le repli étant devenu le chemin
    // dominant, chaque requête pouvait acheter un POST /price facturé.
    getPrice.mockResolvedValue({ price: '80.00' });
    const a = await resolveVariantPrice(37, [12, 18], ctx([], 25));
    const b = await resolveVariantPrice(37, [18, 12], ctx([], 25)); // même combo, autre ordre
    expect(a).toBe(100);
    expect(b).toBe(100);
    expect(getPrice).toHaveBeenCalledTimes(1);
  });

  it('ne mémoïse PAS un échec — sinon le rétablissement de Sinalite est masqué', async () => {
    getPrice.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce({ price: '80.00' });
    expect(await resolveVariantPrice(37, [12, 18], ctx([], 25))).toBeNull();
    expect(await resolveVariantPrice(37, [12, 18], ctx([], 25))).toBe(100);
  });

  it('renvoie null — jamais une estimation — si Sinalite échoue', async () => {
    getPrice.mockRejectedValue(new Error('502'));
    expect(await resolveVariantPrice(1, [1], ctx([], 20))).toBeNull();
  });
});
