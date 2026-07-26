import { describe, it, expect } from 'vitest';
import { parseTurnaroundDays, computeDeliveryDate } from '@/lib/products/turnaround';

describe('parseTurnaroundDays', () => {
  it('reconnaît "Next Business Day" / "Same Day" → 1', () => {
    expect(parseTurnaroundDays('Next Business Day')).toBe(1);
    expect(parseTurnaroundDays('Same Day')).toBe(1);
    expect(parseTurnaroundDays('Same-Day')).toBe(1);
  });

  it('prend le MAX sur une plage (mieux vaut annoncer un jour de trop)', () => {
    expect(parseTurnaroundDays('2 - 3 Business Days')).toBe(3);
    expect(parseTurnaroundDays('2-3 jours')).toBe(3);
  });

  it('reconnaît un nombre seul', () => {
    expect(parseTurnaroundDays('5 jours')).toBe(5);
    expect(parseTurnaroundDays('3 Business Days')).toBe(3);
    expect(parseTurnaroundDays('1 Business Day')).toBe(1);
  });

  it('libellé inconnu → null (fail-safe, pas de chiffre inventé)', () => {
    expect(parseTurnaroundDays('Standard')).toBeNull();
    expect(parseTurnaroundDays('')).toBeNull();
  });
});

describe('computeDeliveryDate', () => {
  it('additionne production + transit en jours ouvrables', () => {
    // Lundi 2026-01-05 (jour ouvrable connu)
    const monday = new Date('2026-01-05T12:00:00Z');
    const { eta, productionDays, transitDays } = computeDeliveryDate(monday, 2, 2);
    expect(productionDays).toBe(2);
    expect(transitDays).toBe(2);
    // 4 jours ouvrables après lundi = vendredi 2026-01-09
    expect(eta.getUTCDate()).toBe(9);
  });

  it('saute les week-ends', () => {
    // Vendredi 2026-01-02
    const friday = new Date('2026-01-02T12:00:00Z');
    const { eta } = computeDeliveryDate(friday, 1, 0);
    // +1 jour ouvrable depuis vendredi = lundi (saute sam/dim)
    expect(eta.getUTCDay()).toBe(1);
  });
});
