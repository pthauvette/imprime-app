/**
 * Tests pour wallet/tiers — pure functions.
 *
 * Round 18 #1.
 */

import { describe, it, expect } from 'vitest';
import {
  tierForAmount,
  computeBonus,
  isValidTopupAmount,
  MIN_TOPUP_CENTS,
  MAX_TOPUP_CENTS,
  WALLET_TIERS,
} from '@/lib/wallet/tiers';

describe('tierForAmount', () => {
  it('null si < tier 1 minimum', () => {
    expect(tierForAmount(0)).toBeNull();
    expect(tierForAmount(49999)).toBeNull(); // $499.99
  });

  it('tier 1 (5%) à pile $500', () => {
    const t = tierForAmount(50000);
    expect(t).not.toBeNull();
    expect(t!.bonusPct).toBe(5);
  });

  it('tier 1 entre $500 et $999.99', () => {
    expect(tierForAmount(99999)!.bonusPct).toBe(5);
  });

  it('tier 2 (8%) à pile $1000', () => {
    expect(tierForAmount(100000)!.bonusPct).toBe(8);
  });

  it('tier 3 (12%) à pile $2500', () => {
    expect(tierForAmount(250000)!.bonusPct).toBe(12);
  });

  it('tier 3 sur très gros montant', () => {
    expect(tierForAmount(900000)!.bonusPct).toBe(12);
  });
});

describe('computeBonus', () => {
  it('0 si pas de tier', () => {
    expect(computeBonus(10000)).toBe(0);    // $100
    expect(computeBonus(49999)).toBe(0);
  });

  it('$25 bonus sur $500 topup (5%)', () => {
    expect(computeBonus(50000)).toBe(2500); // $25
  });

  it('$80 bonus sur $1000 topup (8%)', () => {
    expect(computeBonus(100000)).toBe(8000); // $80
  });

  it('$300 bonus sur $2500 topup (12%)', () => {
    expect(computeBonus(250000)).toBe(30000); // $300
  });

  it('arrondi vers le bas (favoriser Plio, pas le user)', () => {
    // 50001 cents * 5% = 2500.05 → floor à 2500
    expect(computeBonus(50001)).toBe(2500);
  });
});

describe('isValidTopupAmount', () => {
  it('accepte les montants dans la plage', () => {
    expect(isValidTopupAmount(MIN_TOPUP_CENTS)).toBe(true);
    expect(isValidTopupAmount(MAX_TOPUP_CENTS)).toBe(true);
    expect(isValidTopupAmount(50000)).toBe(true);
  });

  it('rejette en dessous du minimum (anti micro-spam)', () => {
    expect(isValidTopupAmount(500)).toBe(false); // $5
    expect(isValidTopupAmount(MIN_TOPUP_CENTS - 1)).toBe(false);
  });

  it('rejette au-dessus du maximum (KYC threshold)', () => {
    expect(isValidTopupAmount(MAX_TOPUP_CENTS + 1)).toBe(false);
    expect(isValidTopupAmount(2_000_000)).toBe(false); // $20k
  });

  it('rejette les valeurs non-entières (cents seulement)', () => {
    expect(isValidTopupAmount(50000.5)).toBe(false);
  });

  it('rejette les négatifs', () => {
    expect(isValidTopupAmount(-1000)).toBe(false);
  });
});

describe('WALLET_TIERS contracts', () => {
  it('tiers ordonnés par minAmountCents ascendant', () => {
    for (let i = 1; i < WALLET_TIERS.length; i++) {
      expect(WALLET_TIERS[i]!.minAmountCents).toBeGreaterThan(WALLET_TIERS[i - 1]!.minAmountCents);
    }
  });

  it('bonus % ascendant avec le tier (plus tu prépayes, mieux c\'est)', () => {
    for (let i = 1; i < WALLET_TIERS.length; i++) {
      expect(WALLET_TIERS[i]!.bonusPct).toBeGreaterThanOrEqual(WALLET_TIERS[i - 1]!.bonusPct);
    }
  });
});
