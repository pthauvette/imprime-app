/**
 * Tests pour computeLoyaltyTier + nextTierProgress.
 *
 * Pure-function unit tests — pas de Prisma, pas de mocks.
 */

import { describe, it, expect } from 'vitest';
import {
  computeLoyaltyTier,
  nextTierProgress,
  SILVER_THRESHOLD_CENTS,
  GOLD_THRESHOLD_CENTS,
  TIER_LABELS,
  TIER_PERKS,
} from '@/lib/customers/loyalty';

describe('computeLoyaltyTier', () => {
  it('BRONZE si revenue = 0', () => {
    expect(computeLoyaltyTier({ revenueLast365dCents: 0 })).toBe('BRONZE');
  });

  it('BRONZE si revenue < seuil SILVER', () => {
    expect(computeLoyaltyTier({ revenueLast365dCents: SILVER_THRESHOLD_CENTS - 1 })).toBe('BRONZE');
  });

  it('SILVER à la borne inférieure (= seuil)', () => {
    expect(computeLoyaltyTier({ revenueLast365dCents: SILVER_THRESHOLD_CENTS })).toBe('SILVER');
  });

  it('SILVER juste avant le seuil GOLD', () => {
    expect(computeLoyaltyTier({ revenueLast365dCents: GOLD_THRESHOLD_CENTS - 1 })).toBe('SILVER');
  });

  it('GOLD à la borne inférieure (= seuil)', () => {
    expect(computeLoyaltyTier({ revenueLast365dCents: GOLD_THRESHOLD_CENTS })).toBe('GOLD');
  });

  it('GOLD bien au-dessus du seuil', () => {
    expect(computeLoyaltyTier({ revenueLast365dCents: 50_000_00 })).toBe('GOLD');
  });
});

describe('nextTierProgress', () => {
  it('BRONZE @ 0 → 0 % vers SILVER', () => {
    const p = nextTierProgress({ revenueLast365dCents: 0 });
    expect(p.current).toBe('BRONZE');
    expect(p.next).toBe('SILVER');
    expect(p.progressPct).toBe(0);
    expect(p.needsCents).toBe(SILVER_THRESHOLD_CENTS);
  });

  it('BRONZE @ 250 $ → 50 % vers SILVER', () => {
    const p = nextTierProgress({ revenueLast365dCents: 250_00 });
    expect(p.current).toBe('BRONZE');
    expect(p.next).toBe('SILVER');
    expect(p.progressPct).toBe(50);
    expect(p.needsCents).toBe(250_00);
  });

  it('SILVER @ seuil → 0 % vers GOLD (juste arrivé)', () => {
    const p = nextTierProgress({ revenueLast365dCents: SILVER_THRESHOLD_CENTS });
    expect(p.current).toBe('SILVER');
    expect(p.next).toBe('GOLD');
    expect(p.progressPct).toBe(0);
    expect(p.needsCents).toBe(GOLD_THRESHOLD_CENTS - SILVER_THRESHOLD_CENTS);
  });

  it('SILVER au milieu → ~50 % vers GOLD', () => {
    // 500 + (2000-500)/2 = 1250
    const p = nextTierProgress({ revenueLast365dCents: 1250_00 });
    expect(p.current).toBe('SILVER');
    expect(p.progressPct).toBe(50);
  });

  it('GOLD → next null, progressPct 100', () => {
    const p = nextTierProgress({ revenueLast365dCents: 5000_00 });
    expect(p.current).toBe('GOLD');
    expect(p.next).toBeNull();
    expect(p.needsCents).toBeNull();
    expect(p.progressPct).toBe(100);
  });

  it('clamp progressPct à 100 si on déborde', () => {
    // edge case : si on est tout proche du tier suivant mais pas encore (rare)
    const p = nextTierProgress({ revenueLast365dCents: GOLD_THRESHOLD_CENTS - 1 });
    expect(p.progressPct).toBeLessThanOrEqual(100);
    expect(p.progressPct).toBeGreaterThan(95);
  });
});

describe('TIER_LABELS / TIER_PERKS', () => {
  it('a un label pour chaque tier', () => {
    expect(TIER_LABELS.BRONZE).toBeTruthy();
    expect(TIER_LABELS.SILVER).toBeTruthy();
    expect(TIER_LABELS.GOLD).toBeTruthy();
  });

  it('a au moins 1 perk pour chaque tier', () => {
    expect(TIER_PERKS.BRONZE.length).toBeGreaterThan(0);
    expect(TIER_PERKS.SILVER.length).toBeGreaterThan(0);
    expect(TIER_PERKS.GOLD.length).toBeGreaterThan(0);
  });

  it('GOLD a plus de perks que BRONZE', () => {
    expect(TIER_PERKS.GOLD.length).toBeGreaterThan(TIER_PERKS.BRONZE.length);
  });
});
