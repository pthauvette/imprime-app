/**
 * Tests money path — Round 31.
 *
 * Couverture des helpers `src/lib/` qui calculent du money :
 *   - computeTax (taxes/index.ts)         — 13 provinces × 4 régimes fiscaux
 *   - applyShippingPerks (customers/perks) — GOLD free shipping
 *   - computeResellerDiscount + describeResellerDiscount (reseller/perks)
 *
 * Pourquoi maintenant : audit Round 30 #1 a remonté que ces 3 modules
 * (qui décident combien Stripe débite) n'avaient AUCUN test. Un bug
 * silencieux ici = revenue lost ou chargeback. Le test orders-create
 * existait mais testait l'intégration, pas les helpers en isolation.
 */

import { describe, it, expect } from 'vitest';
import { computeTax, provinceName } from '@/lib/taxes';
import { applyShippingPerks } from '@/lib/customers/perks';
import { computeResellerDiscount, describeResellerDiscount, RESELLER_DISCOUNT_PCT, PLATINUM_DISCOUNT_PCT, PLATINUM_REVENUE_THRESHOLD_CENTS, shouldBePlatinum } from '@/lib/reseller/perks';

// ─── computeTax ──────────────────────────────────────────────────────────

describe('computeTax — HST provinces (ON, NB, NL, NS, PE)', () => {
  it('ON @ 13 % sur 100 $ → 13 $ HST seul', () => {
    const r = computeTax(100, 'ON');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.code).toBe('hst');
    expect(r.lines[0]!.rate).toBe(0.13);
    expect(r.lines[0]!.amount).toBe(13);
    expect(r.total).toBe(13);
    expect(r.combinedRate).toBe(0.13);
  });

  it('NB/NL/NS/PE @ 15 %', () => {
    for (const prov of ['NB', 'NL', 'NS', 'PE'] as const) {
      const r = computeTax(100, prov);
      expect(r.lines[0]!.amount).toBe(15);
      expect(r.combinedRate).toBe(0.15);
    }
  });

  it('label inclut le nom de province FR', () => {
    expect(computeTax(100, 'ON').lines[0]!.label).toMatch(/Ontario/);
    expect(computeTax(100, 'NS').lines[0]!.label).toMatch(/Nouvelle-Écosse/);
  });
});

describe('computeTax — QC (TPS + TVQ)', () => {
  it('100 $ → 5 $ TPS + 9,98 $ TVQ = 14,98 $ total', () => {
    const r = computeTax(100, 'QC');
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]!.code).toBe('gst');
    expect(r.lines[0]!.amount).toBe(5);
    expect(r.lines[1]!.code).toBe('qst');
    expect(r.lines[1]!.amount).toBe(9.98); // 100 * 0.09975 = 9.975 → round2 = 9.98
    expect(r.total).toBe(14.98); // 5 + 9.98 = 14.98 (round séparé puis sum)
    expect(r.combinedRate).toBeCloseTo(0.14975, 5);
  });

  it('TVQ calculée sur subtotal pré-TPS (pas TPS-sur-TVQ harmonisé)', () => {
    // 1000 $ → TPS 50, TVQ 99.75 → total 149.75
    // Si on appliquait TVQ sur (sub + TPS), ce serait 1050 * 0.09975 = 104.74
    const r = computeTax(1000, 'QC');
    expect(r.lines[1]!.amount).toBe(99.75);
  });
});

describe('computeTax — PST provinces (BC, SK, MB)', () => {
  it('BC : GST 5 % + PST 7 %', () => {
    const r = computeTax(100, 'BC');
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]!.code).toBe('gst');
    expect(r.lines[0]!.amount).toBe(5);
    expect(r.lines[1]!.code).toBe('pst');
    expect(r.lines[1]!.rate).toBe(0.07);
    expect(r.lines[1]!.amount).toBe(7);
    expect(r.total).toBe(12);
  });

  it('SK @ 6 %', () => {
    expect(computeTax(100, 'SK').lines[1]!.amount).toBe(6);
  });

  it('MB @ 7 %', () => {
    expect(computeTax(100, 'MB').lines[1]!.amount).toBe(7);
  });
});

describe('computeTax — GST seul (AB + territoires NT/NU/YT)', () => {
  it('AB → 1 ligne GST 5 %', () => {
    const r = computeTax(100, 'AB');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.code).toBe('gst');
    expect(r.lines[0]!.amount).toBe(5);
    expect(r.total).toBe(5);
  });

  it('territoires NT/NU/YT → GST seul', () => {
    for (const prov of ['NT', 'NU', 'YT'] as const) {
      const r = computeTax(100, prov);
      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]!.amount).toBe(5);
    }
  });
});

describe('computeTax — edge cases', () => {
  it('subtotal 0 → toutes les taxes 0, structure préservée', () => {
    const r = computeTax(0, 'QC');
    expect(r.lines).toHaveLength(2);
    expect(r.total).toBe(0);
    expect(r.lines.every((l) => l.amount === 0)).toBe(true);
  });

  it('arrondi 2 décimales — 33,33 $ ON @ 13 %', () => {
    // 33.33 * 0.13 = 4.3329 → round2 = 4.33
    const r = computeTax(33.33, 'ON');
    expect(r.lines[0]!.amount).toBe(4.33);
  });

  it('subtotal négatif (jamais should happen mais defensif) → tax négative', () => {
    // Pas une situation valide en prod (subtotal toujours > 0 après checkout
    // validation), mais la fonction ne crash pas — utile pour les test
    // qui simulent remboursements partiels.
    const r = computeTax(-100, 'ON');
    expect(r.lines[0]!.amount).toBe(-13);
  });
});

describe('provinceName', () => {
  it('retourne le nom FR pour les 13 provinces/territoires', () => {
    expect(provinceName('QC')).toBe('Québec');
    expect(provinceName('NL')).toBe('Terre-Neuve-et-Labrador');
    expect(provinceName('PE')).toBe('Île-du-Prince-Édouard');
  });
});

// ─── applyShippingPerks ──────────────────────────────────────────────────

describe('applyShippingPerks — GOLD free shipping (Round 13 #5)', () => {
  it('GOLD avec shipping > 0 → effectif 0 + flag true', () => {
    const r = applyShippingPerks({ tier: 'GOLD', shippingPrice: 25 });
    expect(r.effectiveShippingPrice).toBe(0);
    expect(r.goldFreeShipping).toBe(true);
  });

  it('GOLD avec shipping = 0 (déjà gratuit) → flag false (rien à offrir)', () => {
    const r = applyShippingPerks({ tier: 'GOLD', shippingPrice: 0 });
    expect(r.effectiveShippingPrice).toBe(0);
    expect(r.goldFreeShipping).toBe(false);
  });

  it('SILVER/BRONZE → pas de perk, shipping intact', () => {
    for (const tier of ['SILVER', 'BRONZE']) {
      const r = applyShippingPerks({ tier, shippingPrice: 25 });
      expect(r.effectiveShippingPrice).toBe(25);
      expect(r.goldFreeShipping).toBe(false);
    }
  });

  it('tier null (guest) → pas de perk', () => {
    const r = applyShippingPerks({ tier: null, shippingPrice: 25 });
    expect(r.effectiveShippingPrice).toBe(25);
    expect(r.goldFreeShipping).toBe(false);
  });

  it('PLATINUM reseller tier → pas de free shipping ici (perk loyalty, pas reseller)', () => {
    // Round 33 — PLATINUM est un tier RESELLER (10% off), pas un tier
    // LOYALTY. applyShippingPerks regarde loyaltyTier seulement (BRONZE/
    // SILVER/GOLD). PLATINUM-reseller n'a pas de perk shipping ici, son
    // perk c'est computeResellerDiscount.
    const r = applyShippingPerks({ tier: 'PLATINUM' as never, shippingPrice: 25 });
    expect(r.goldFreeShipping).toBe(false);
  });
});

// ─── computeResellerDiscount ─────────────────────────────────────────────

describe('computeResellerDiscount — Round 22 #2', () => {
  it('VERIFIED sur 100 $ (10000 cents) → 5 % = 500 cents', () => {
    expect(computeResellerDiscount(10000, 'VERIFIED')).toBe(500);
  });

  it('AUTO_DETECTED → 0 (perk requires VERIFIED)', () => {
    expect(computeResellerDiscount(10000, 'AUTO_DETECTED')).toBe(0);
  });

  it('NONE → 0', () => {
    expect(computeResellerDiscount(10000, 'NONE')).toBe(0);
  });

  it('subtotal 0 → 0 (pas de division/multiplication weird)', () => {
    expect(computeResellerDiscount(0, 'VERIFIED')).toBe(0);
  });

  it('subtotal négatif (refund scenario) → 0 (favor Plio)', () => {
    expect(computeResellerDiscount(-10000, 'VERIFIED')).toBe(0);
  });

  it('floor pour favoriser Plio — 199 cents @ 5 % = 9 (pas 9.95)', () => {
    // 199 * 5 / 100 = 9.95 → Math.floor = 9
    expect(computeResellerDiscount(199, 'VERIFIED')).toBe(9);
  });

  it('cohérence avec RESELLER_DISCOUNT_PCT exporté', () => {
    expect(RESELLER_DISCOUNT_PCT).toBe(5);
    expect(computeResellerDiscount(10000, 'VERIFIED')).toBe((10000 * RESELLER_DISCOUNT_PCT) / 100);
  });
});

describe('describeResellerDiscount — UI helper', () => {
  it('VERIFIED → returns { amountCents, pct, label FR }', () => {
    const d = describeResellerDiscount(10000, 'VERIFIED');
    expect(d).not.toBeNull();
    expect(d!.amountCents).toBe(500);
    expect(d!.pct).toBe(5);
    expect(d!.label).toBe('Reseller perks (-5 %)');
  });

  it('non-VERIFIED/PLATINUM → null (UI peut conditionnellement rendre)', () => {
    expect(describeResellerDiscount(10000, 'AUTO_DETECTED')).toBeNull();
    expect(describeResellerDiscount(10000, 'NONE')).toBeNull();
  });

  it('VERIFIED mais subtotal 0 → null (pas d\'amount à afficher)', () => {
    expect(describeResellerDiscount(0, 'VERIFIED')).toBeNull();
  });
});

// ─── PLATINUM tier (Round 33) ────────────────────────────────────────────

describe('PLATINUM reseller tier — Round 33', () => {
  it('PLATINUM_DISCOUNT_PCT = 10 (vs VERIFIED 5)', () => {
    expect(PLATINUM_DISCOUNT_PCT).toBe(10);
    expect(RESELLER_DISCOUNT_PCT).toBe(5);
  });

  it('PLATINUM_REVENUE_THRESHOLD_CENTS = 2 000 000 (20 000 $)', () => {
    expect(PLATINUM_REVENUE_THRESHOLD_CENTS).toBe(2_000_000);
  });

  it('computeResellerDiscount PLATINUM sur 100 $ → 10 % = 1 000 cents', () => {
    expect(computeResellerDiscount(10000, 'PLATINUM')).toBe(1000);
  });

  it('computeResellerDiscount PLATINUM sur 1 $ floor → 10 cents', () => {
    expect(computeResellerDiscount(100, 'PLATINUM')).toBe(10);
  });

  it('describeResellerDiscount PLATINUM → label "PLATINUM perks (-10 %)"', () => {
    const d = describeResellerDiscount(10000, 'PLATINUM');
    expect(d).not.toBeNull();
    expect(d!.amountCents).toBe(1000);
    expect(d!.pct).toBe(10);
    expect(d!.label).toBe('PLATINUM perks (-10 %)');
  });

  it('shouldBePlatinum — exactement 20 000 $ → true', () => {
    expect(shouldBePlatinum(2_000_000)).toBe(true);
  });

  it('shouldBePlatinum — 19 999 $ → false', () => {
    expect(shouldBePlatinum(1_999_900)).toBe(false);
  });

  it('shouldBePlatinum — 100 000 $ → true (way over)', () => {
    expect(shouldBePlatinum(10_000_000)).toBe(true);
  });

  it('shouldBePlatinum — 0 → false', () => {
    expect(shouldBePlatinum(0)).toBe(false);
  });
});
