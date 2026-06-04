/**
 * POST /api/products/[id] — audit-vérif Funnel #1.
 *
 * Verrouille que le single-price endpoint (celui que la page review appelle pour
 * l'affichage ET le calcul d'expectedSubtotal) renvoie le prix MARKUP INCLUS
 * (getEnrichedVariantIndex), aligné sur le subtotal facturé par /api/orders/create.
 * Avant, il renvoyait l'index BRUT → toute marge admin cassait le checkout en
 * PRICE_MISMATCH 409. Complète l'audit v2 #6.2 (qui n'avait corrigé que /variants).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/sinalite/client', () => ({
  sinalite: {
    getProduct: vi.fn(),
    getProductDetail: vi.fn(),
    getPrice: vi.fn(async () => ({
      price: '50.00',
      packageInfo: {},
      productOptions: {},
    })),
  },
}));

vi.mock('@/lib/products/pricing', () => ({
  getEnrichedVariantIndex: vi.fn(async () => ({
    index: new Map([['4-30-78', 1099]]), // prix DÉTAIL (markup déjà appliqué)
    hiddenOptionIds: new Set<number>(),
    marginPct: 10,
    variantCount: 1,
  })),
}));

import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { sinalite } from '@/lib/sinalite/client';

async function postPrice(id: string, optionIds: number[]) {
  const { POST } = await import('@/app/api/products/[id]/route');
  return POST(
    new Request(`http://localhost/api/products/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionIds }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/products/[id] — markup (Funnel #1)', () => {
  it('index-hit : renvoie le prix ENRICHI (markup), pas le brut Sinalite', async () => {
    const res = await postPrice('42', [4, 30, 78]);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(getEnrichedVariantIndex).toHaveBeenCalledWith(42); // chemin enrichi
    expect(json.price).toBe(1099); // valeur markup-incluse de l'index
    expect(sinalite.getPrice).not.toHaveBeenCalled();
  });

  it('combo absente (remote fallback) : applique le multiplier de marge au prix remote', async () => {
    // [999] absent de l'index → remote ; marginPct 10 → 50,00 $ × 1,10 = 55,00 $
    const res = await postPrice('42', [999]);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(sinalite.getPrice).toHaveBeenCalled();
    expect(json.price).toBe(55);
  });

  it('id non numérique → 400 (validation)', async () => {
    const res = await postPrice('abc', [1]);
    expect(res.status).toBe(400);
  });
});
