/**
 * Tests pour reseller/perks — pure functions.
 *
 * Round 22 #2.
 */

import { describe, it, expect } from 'vitest';
import {
  computeResellerDiscount,
  describeResellerDiscount,
  RESELLER_DISCOUNT_PCT,
} from '@/lib/reseller/perks';

describe('computeResellerDiscount', () => {
  it('0 si status NONE', () => {
    expect(computeResellerDiscount(10000, 'NONE')).toBe(0);
  });

  it('0 si status AUTO_DETECTED (perks pas débloquées)', () => {
    expect(computeResellerDiscount(10000, 'AUTO_DETECTED')).toBe(0);
  });

  it('5% si VERIFIED sur subtotal $100 = $5', () => {
    expect(computeResellerDiscount(10000, 'VERIFIED')).toBe(500);
  });

  it('5% sur $500 = $25', () => {
    expect(computeResellerDiscount(50000, 'VERIFIED')).toBe(2500);
  });

  it('round DOWN (favorise Plio)', () => {
    // 1011 * 5% = 50.55 → floor 50
    expect(computeResellerDiscount(1011, 'VERIFIED')).toBe(50);
  });

  it('0 si subtotal ≤ 0 (defensive)', () => {
    expect(computeResellerDiscount(0, 'VERIFIED')).toBe(0);
    expect(computeResellerDiscount(-100, 'VERIFIED')).toBe(0);
  });

  it('constant matches expected', () => {
    expect(RESELLER_DISCOUNT_PCT).toBe(5);
  });
});

describe('describeResellerDiscount', () => {
  it('null si pas de discount', () => {
    expect(describeResellerDiscount(10000, 'NONE')).toBeNull();
    expect(describeResellerDiscount(10000, 'AUTO_DETECTED')).toBeNull();
    expect(describeResellerDiscount(0, 'VERIFIED')).toBeNull();
  });

  it('breakdown shape correct si VERIFIED', () => {
    const r = describeResellerDiscount(10000, 'VERIFIED');
    expect(r).toEqual({
      amountCents: 500,
      pct: 5,
      label: 'Reseller perks (-5 %)',
    });
  });
});
