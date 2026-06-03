/**
 * GET /api/products/[id]/variants — Audit v2 #6.2.
 *
 * Verrouille que l'endpoint passe par getEnrichedVariantIndex (prix de DÉTAIL,
 * markup appliqué) et NON par les prix de gros bruts Sinalite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/products/pricing', () => ({
  getEnrichedVariantIndex: vi.fn(async () => ({
    index: new Map([
      ['4-30-78', 1099], // prix DÉTAIL (markup déjà appliqué)
      ['4-30-79', 2099],
    ]),
    hiddenOptionIds: new Set<number>(),
    marginPct: 10,
  })),
}));

import { getEnrichedVariantIndex } from '@/lib/products/pricing';

async function call(id: string) {
  const { GET } = await import('@/app/api/products/[id]/variants/route');
  return GET(new Request(`http://localhost/api/products/${id}/variants`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/products/[id]/variants — markup (#6.2)', () => {
  it('renvoie l\'index ENRICHI (prix détail), pas les prix de gros bruts', async () => {
    const res = await call('42');
    expect(res.status).toBe(200);
    const json = await res.json();

    // passe bien par le chemin enrichi (markup)
    expect(getEnrichedVariantIndex).toHaveBeenCalledWith(42);
    expect(json.variants).toEqual([
      { key: '4-30-78', price: 1099 },
      { key: '4-30-79', price: 2099 },
    ]);
    expect(json.count).toBe(2);
    expect(json.hasMore).toBe(false);
    expect(json.productId).toBe(42);
  });

  it('id non numérique → 400 (validation)', async () => {
    const res = await call('abc');
    expect(res.status).toBe(400);
  });
});
