/**
 * Tests pour applyShippingPerks (Round 13 #5).
 *
 * Pure-function tests, pas de DB. Vérifie que :
 *   - GOLD avec shipping > 0 → effectiveShippingPrice = 0, perk applied
 *   - GOLD avec shipping = 0 → no-op (rien à offrir)
 *   - SILVER / BRONZE / null / unknown → no-op
 *   - Pas de side effects sur l'input
 */

import { describe, it, expect } from 'vitest';
import { applyShippingPerks } from '@/lib/customers/perks';

describe('applyShippingPerks', () => {
  it('GOLD avec shipping payé → free shipping', () => {
    const r = applyShippingPerks({ tier: 'GOLD', shippingPrice: 25 });
    expect(r.effectiveShippingPrice).toBe(0);
    expect(r.goldFreeShipping).toBe(true);
  });

  it('GOLD avec shipping déjà 0 → no-op', () => {
    const r = applyShippingPerks({ tier: 'GOLD', shippingPrice: 0 });
    expect(r.effectiveShippingPrice).toBe(0);
    expect(r.goldFreeShipping).toBe(false); // pas de "perk applied" si rien à offrir
  });

  it('SILVER → pas de free shipping', () => {
    const r = applyShippingPerks({ tier: 'SILVER', shippingPrice: 25 });
    expect(r.effectiveShippingPrice).toBe(25);
    expect(r.goldFreeShipping).toBe(false);
  });

  it('BRONZE → pas de free shipping', () => {
    const r = applyShippingPerks({ tier: 'BRONZE', shippingPrice: 25 });
    expect(r.effectiveShippingPrice).toBe(25);
    expect(r.goldFreeShipping).toBe(false);
  });

  it('tier null (guest checkout) → pas de free shipping', () => {
    const r = applyShippingPerks({ tier: null, shippingPrice: 25 });
    expect(r.effectiveShippingPrice).toBe(25);
    expect(r.goldFreeShipping).toBe(false);
  });

  it('tier unknown (forward-compat) → pas de free shipping', () => {
    const r = applyShippingPerks({ tier: 'PLATINUM' as never, shippingPrice: 25 });
    expect(r.effectiveShippingPrice).toBe(25);
    expect(r.goldFreeShipping).toBe(false);
  });

  it('input non mutée', () => {
    const input = { tier: 'GOLD' as const, shippingPrice: 12 };
    applyShippingPerks(input);
    expect(input.shippingPrice).toBe(12);
  });
});
