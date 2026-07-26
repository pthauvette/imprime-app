/**
 * POST /api/products/[id]/price — repli de prix du configurateur.
 *
 * BUG D'ORIGINE (rapporté 2026-07) : « dans la configuration d'un produit, il y
 * en a que le prix n'est pas affiché ». Le configurateur ne lisait QUE l'index
 * local (`variantIndex[key] ?? null`) ; quand la combinaison manquait (produits
 * `custom_size`/`shapes`, matrice partielle), il affichait « Prix indisponible »
 * ET désactivait « Continuer » → produit INCOMMANDABLE, alors que le chemin de
 * commande (price-order.ts) savait le tarifer via `sinalite.getPrice`.
 *
 * Ces tests verrouillent la symétrie retrouvée, et surtout l'invariant qui
 * compte : le prix AFFICHÉ doit être celui FACTURÉ (même marge, même arrondi).
 * Un écart d'un cent ici déclencherait un PRICE_MISMATCH au checkout — pire que
 * l'absence de prix.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/products/pricing', () => ({ getEnrichedVariantIndex: vi.fn() }));
vi.mock('@/lib/sinalite/client', () => ({ sinalite: { getPrice: vi.fn() } }));
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 99 })),
  clientIp: vi.fn(() => '203.0.113.9'),
}));

import { NextResponse } from 'next/server';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { sinalite } from '@/lib/sinalite/client';
import { rateLimit } from '@/lib/ratelimit';

const ctx = { params: Promise.resolve({ id: '42' }) };

function post(body: unknown) {
  return new Request('http://localhost/api/products/42/price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** État par défaut : index SANS la combinaison demandée, marge 30 %. */
function mockIndex(over: Partial<{
  index: Map<string, number>;
  hiddenOptionIds: Set<number>;
  marginPct: number | null;
  disabled: boolean;
}> = {}) {
  vi.mocked(getEnrichedVariantIndex).mockResolvedValue({
    index: over.index ?? new Map<string, number>(),
    hiddenOptionIds: over.hiddenOptionIds ?? new Set<number>(),
    marginPct: over.marginPct === undefined ? 30 : over.marginPct,
    disabled: over.disabled ?? false,
    variantCount: 0,
  } as never);
}

async function call(body: unknown) {
  vi.resetModules();
  const { POST } = await import('@/app/api/products/[id]/price/route');
  return POST(post(body), ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 99 } as never);
});

describe('POST /api/products/[id]/price', () => {
  it('index local : renvoie le prix SANS appeler Sinalite (déjà marké)', async () => {
    // L'index porte déjà la marge — le re-multiplier doublerait le markup.
    mockIndex({ index: new Map([['1-2-3', 99.2]]) });

    const res = await call({ optionIds: [3, 1, 2] }); // ordre quelconque
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ price: 99.2, source: 'index' });
    expect(sinalite.getPrice).not.toHaveBeenCalled();
  });

  it('LE FIX — combinaison absente de l’index → repli distant, marge appliquée', async () => {
    // C'est le cas du bug : l'index ne connaît pas la combinaison.
    mockIndex({ index: new Map(), marginPct: 30 });
    vi.mocked(sinalite.getPrice).mockResolvedValue({ price: '100.00' } as never);

    const res = await call({ optionIds: [7, 8] });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.source).toBe('remote');
    // 100 × 1,30 = 130 — la marge DOIT être appliquée au prix distant (brut),
    // sinon on vendrait au prix coûtant.
    expect(json.price).toBe(130);
    expect(sinalite.getPrice).toHaveBeenCalledWith(42, [7, 8]);
  });

  it('arrondit au cent comme l’index (l’affiché == le facturé)', async () => {
    mockIndex({ index: new Map(), marginPct: 30 });
    vi.mocked(sinalite.getPrice).mockResolvedValue({ price: '33.33' } as never);

    const json = await (await call({ optionIds: [5] })).json();
    // 33,33 × 1,3 = 43,329 → 43,33 (Math.round(x*100)/100, identique à pricing.ts)
    expect(json.price).toBe(43.33);
  });

  it('marge nulle explicite (0 %) est respectée — pas de plancher masqué', async () => {
    mockIndex({ index: new Map(), marginPct: 0 });
    vi.mocked(sinalite.getPrice).mockResolvedValue({ price: '50.00' } as never);

    expect((await (await call({ optionIds: [5] })).json()).price).toBe(50);
  });

  it('produit désactivé → 400 PRODUCT_DISABLED, aucun appel Sinalite', async () => {
    // Même sémantique que price-order.ts : configurateur et checkout doivent
    // raconter la même histoire.
    mockIndex({ disabled: true });

    const res = await call({ optionIds: [1] });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PRODUCT_DISABLED');
    expect(sinalite.getPrice).not.toHaveBeenCalled();
  });

  it('option masquée par l’admin → 400, impossible de la tarifer en la forgeant', async () => {
    mockIndex({ hiddenOptionIds: new Set([9]) });

    const res = await call({ optionIds: [1, 9] });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('OPTION_HIDDEN');
    expect(sinalite.getPrice).not.toHaveBeenCalled();
  });

  it('prix distant nul/absurde → 502, JAMAIS 0,00 $ affiché', async () => {
    // Afficher 0 $ laisserait commander à perte ; « indisponible » est honnête.
    mockIndex({ index: new Map() });
    vi.mocked(sinalite.getPrice).mockResolvedValue({ price: '0' } as never);

    const res = await call({ optionIds: [1] });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('PRICE_FETCH_FAILED');
  });

  it('Sinalite en panne → 502 propre (pas de 500 opaque)', async () => {
    mockIndex({ index: new Map() });
    vi.mocked(sinalite.getPrice).mockRejectedValue(new Error('timeout'));

    const res = await call({ optionIds: [1] });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('PRICE_FETCH_FAILED');
  });

  it('rate-limité → 429 AVANT tout appel Sinalite (API payante)', async () => {
    vi.mocked(rateLimit).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ code: 'RATE_LIMITED' }, { status: 429 }),
    } as never);
    mockIndex({ index: new Map() });

    const res = await call({ optionIds: [1] });
    expect(res.status).toBe(429);
    expect(sinalite.getPrice).not.toHaveBeenCalled();
    expect(getEnrichedVariantIndex).not.toHaveBeenCalled();
  });

  it('payload invalide (vide / trop long) → 400, rien n’atteint Sinalite', async () => {
    mockIndex({ index: new Map() });

    expect((await call({ optionIds: [] })).status).toBe(400);
    expect((await call({ optionIds: Array.from({ length: 41 }, (_, i) => i + 1) })).status).toBe(400);
    expect(sinalite.getPrice).not.toHaveBeenCalled();
  });
});
