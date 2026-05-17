/**
 * Tests des 5 régimes de taxes canadiennes.
 *
 * Chaque province a son régime :
 *   - HST seul (ON 13%, NB/NL/NS/PE 15%)
 *   - TPS + TVQ (QC : 5% + 9.975%)
 *   - GST + PST (BC 5+7, SK 5+6, MB 5+7)
 *   - GST seul (AB + territoires NT/NU/YT)
 *
 * Critère pass : chaque calcul exact à 2 décimales pour 100 $ subtotal.
 */

import { describe, it, expect } from 'vitest';
import { computeTax } from '@/lib/taxes';

describe('computeTax — HST provinces (un seul taux)', () => {
  it('ON : 100$ × 13% = 13.00$', () => {
    const r = combine(100, 'ON');
    expect(r.total).toBe(13);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].code).toBe('hst');
    expect(r.lines[0].rate).toBe(0.13);
  });

  it.each([
    ['NB', 0.15],
    ['NL', 0.15],
    ['NS', 0.15],
    ['PE', 0.15],
  ] as const)('%s : 100$ × 15%% = 15.00$', (province, rate) => {
    const r = combine(100, province);
    expect(r.total).toBe(15);
    expect(r.lines[0].rate).toBe(rate);
  });

  it('arrondit au cent près : 33.33$ × 13% (ON) = 4.33$', () => {
    expect(combine(33.33, 'ON').total).toBe(4.33);
  });
});

describe('computeTax — Québec (TPS + TVQ séparées)', () => {
  it('100$ : TPS 5.00 + TVQ 9.98 (arrondi) = 14.98$', () => {
    const r = combine(100, 'QC');
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ code: 'gst', rate: 0.05, amount: 5 });
    expect(r.lines[1]).toMatchObject({ code: 'qst', rate: 0.09975, amount: 9.98 });
    expect(r.total).toBe(14.98);
  });

  it('combinedRate QC = 0.14975', () => {
    const r = combine(100, 'QC');
    expect(r.combinedRate).toBeCloseTo(0.14975, 5);
  });

  it('subtotal 0$ produit 0$ TPS + 0$ TVQ', () => {
    const r = combine(0, 'QC');
    expect(r.total).toBe(0);
    expect(r.lines[0].amount).toBe(0);
    expect(r.lines[1].amount).toBe(0);
  });
});

describe('computeTax — GST + PST (BC, SK, MB)', () => {
  it('BC : 100$ × (5+7)% = 12.00$', () => {
    const r = combine(100, 'BC');
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ code: 'gst', amount: 5 });
    expect(r.lines[1]).toMatchObject({ code: 'pst', rate: 0.07, amount: 7 });
    expect(r.total).toBe(12);
  });

  it('SK : 100$ × (5+6)% = 11.00$', () => {
    const r = combine(100, 'SK');
    expect(r.lines[1].rate).toBe(0.06);
    expect(r.total).toBe(11);
  });

  it('MB : 100$ × (5+7)% = 12.00$', () => {
    const r = combine(100, 'MB');
    expect(r.lines[1].rate).toBe(0.07);
    expect(r.total).toBe(12);
  });
});

describe('computeTax — GST seul (Alberta + territoires)', () => {
  it.each(['AB', 'NT', 'NU', 'YT'] as const)('%s : 100$ × 5% = 5.00$', (province) => {
    const r = combine(100, province);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].code).toBe('gst');
    expect(r.lines[0].rate).toBe(0.05);
    expect(r.total).toBe(5);
  });
});

describe('computeTax — cas réels (commande Plio typique)', () => {
  it('commande 187.42$ (sub+ship) QC → 28.07$ taxes', () => {
    // TPS 5%    : 187.42 * 0.05    = 9.371      → 9.37
    // TVQ 9.975%: 187.42 * 0.09975 = 18.695145  → 18.70 (round up)
    // Total : 9.37 + 18.70 = 28.07
    const r = combine(187.42, 'QC');
    expect(r.total).toBe(28.07);
    expect(r.lines[0].amount).toBe(9.37);
    expect(r.lines[1].amount).toBe(18.70);
  });

  it('commande 999.99$ ON → 130.00$ HST', () => {
    // 999.99 * 0.13 = 129.9987 → 130.00
    const r = combine(999.99, 'ON');
    expect(r.total).toBe(130);
  });

  it('grosse commande 4500$ BC → 540$ taxes (225 GST + 315 PST)', () => {
    const r = combine(4500, 'BC');
    expect(r.lines[0].amount).toBe(225);
    expect(r.lines[1].amount).toBe(315);
    expect(r.total).toBe(540);
  });
});

// Helper : combine est juste un alias pour clarifier les tests
function combine(subtotal: number, province: Parameters<typeof computeTax>[1]) {
  return computeTax(subtotal, province);
}
