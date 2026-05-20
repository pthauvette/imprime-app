/**
 * Tests pour ab/analyze — lift + verdict.
 */

import { describe, it, expect } from 'vitest';
import { analyzeVariants, verdictForExperiment, MIN_SAMPLE_SIZE } from '@/lib/ab/analyze';

describe('analyzeVariants', () => {
  it('control sans data → liftPct null partout', () => {
    const r = analyzeVariants([
      { variantId: 'control', assignments: 0, conversions: 0, rate: 0, isControl: true },
      { variantId: 'v_a', assignments: 50, conversions: 5, rate: 0.1, isControl: false },
    ]);
    expect(r.every((v) => v.liftPct === null)).toBe(true);
  });

  it('control + variant → lift relatif', () => {
    const r = analyzeVariants([
      { variantId: 'control', assignments: 1000, conversions: 50, rate: 0.05, isControl: true },
      { variantId: 'v_a', assignments: 1000, conversions: 100, rate: 0.10, isControl: false },
    ]);
    const variantA = r.find((v) => v.variantId === 'v_a')!;
    expect(variantA.liftPct).toBeCloseTo(100, 0); // 10% vs 5% = +100% relative lift
    expect(variantA.isWinning).toBe(true);
  });

  it('variant negative lift → isWinning false', () => {
    const r = analyzeVariants([
      { variantId: 'control', assignments: 1000, conversions: 100, rate: 0.10, isControl: true },
      { variantId: 'v_a', assignments: 1000, conversions: 50, rate: 0.05, isControl: false },
    ]);
    const variantA = r.find((v) => v.variantId === 'v_a')!;
    expect(variantA.liftPct).toBeCloseTo(-50, 0);
    expect(variantA.isWinning).toBe(false);
  });

  it('variant winning mais sample size insuffisant → isWinning false', () => {
    const r = analyzeVariants([
      { variantId: 'control', assignments: 50, conversions: 1, rate: 0.02, isControl: true },
      { variantId: 'v_a', assignments: 50, conversions: 5, rate: 0.10, isControl: false },
    ]);
    const variantA = r.find((v) => v.variantId === 'v_a')!;
    expect(variantA.liftPct).toBeGreaterThan(0);
    expect(variantA.isWinning).toBe(false); // < MIN_SAMPLE_SIZE
  });

  it('sort : control first puis par rate desc', () => {
    const r = analyzeVariants([
      { variantId: 'v_a', assignments: 100, conversions: 5, rate: 0.05, isControl: false },
      { variantId: 'v_b', assignments: 100, conversions: 10, rate: 0.10, isControl: false },
      { variantId: 'control', assignments: 100, conversions: 7, rate: 0.07, isControl: true },
    ]);
    expect(r.map((v) => v.variantId)).toEqual(['control', 'v_b', 'v_a']);
  });
});

describe('verdictForExperiment', () => {
  it('totalAssignments 0 → message "Pas encore de data"', () => {
    const v = verdictForExperiment([
      { variantId: 'control', assignments: 0, conversions: 0, rate: 0, isControl: true },
    ]);
    expect(v.totalAssignments).toBe(0);
    expect(v.hasEnoughData).toBe(false);
    expect(v.message).toMatch(/Pas encore/);
  });

  it('Sample insuffisant → message "X assignments needed"', () => {
    const v = verdictForExperiment([
      { variantId: 'control', assignments: 50, conversions: 5, rate: 0.10, isControl: true },
      { variantId: 'v_a', assignments: 50, conversions: 10, rate: 0.20, isControl: false },
    ]);
    expect(v.hasEnoughData).toBe(false);
    expect(v.message).toMatch(/needed/);
  });

  it('Sample suffisant + winner → message "Winner"', () => {
    const v = verdictForExperiment([
      { variantId: 'control', assignments: MIN_SAMPLE_SIZE, conversions: 5, rate: 0.05, isControl: true },
      { variantId: 'v_a', assignments: MIN_SAMPLE_SIZE, conversions: 10, rate: 0.10, isControl: false },
    ]);
    expect(v.hasEnoughData).toBe(true);
    expect(v.winnerVariantId).toBe('v_a');
    expect(v.winnerLiftPct).toBeCloseTo(100, 0);
    expect(v.message).toMatch(/Winner/);
  });

  it('Sample suffisant mais control gagne → no winner, message neutre', () => {
    const v = verdictForExperiment([
      { variantId: 'control', assignments: MIN_SAMPLE_SIZE, conversions: 10, rate: 0.10, isControl: true },
      { variantId: 'v_a', assignments: MIN_SAMPLE_SIZE, conversions: 5, rate: 0.05, isControl: false },
    ]);
    expect(v.winnerVariantId).toBeNull();
    expect(v.message).toMatch(/aucun variant/i);
  });
});
