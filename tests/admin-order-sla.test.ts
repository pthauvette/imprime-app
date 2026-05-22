/**
 * Tests pour les helpers SLA — Round 25 #3.
 *
 * Pure functions, pas de DB. On test :
 *   - quantile() : nearest-rank correct sur edge cases (vide, single, even, odd)
 *   - computeOrderDurations() : extract submitMs + shipMs depuis events
 *   - integration : un Order sans paidAt n'est pas compté
 */

import { describe, it, expect } from 'vitest';
import { quantile, computeOrderDurations } from '@/lib/admin/order-sla';

describe('quantile()', () => {
  it('retourne null si liste vide', () => {
    expect(quantile([], 0.5)).toBe(null);
  });

  it('single value → returns it pour tous les q', () => {
    expect(quantile([42], 0.5)).toBe(42);
    expect(quantile([42], 0.95)).toBe(42);
    expect(quantile([42], 0.01)).toBe(42);
  });

  it('P50 sur 10 valeurs', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // nearest-rank : ceil(0.5 * 10) - 1 = 4 → sorted[4] = 5
    expect(quantile(vals, 0.5)).toBe(5);
  });

  it('P95 sur 100 valeurs', () => {
    const vals = Array.from({ length: 100 }, (_, i) => i + 1);
    // ceil(0.95 * 100) - 1 = 94 → sorted[94] = 95
    expect(quantile(vals, 0.95)).toBe(95);
  });

  it('ne mute pas l\'input', () => {
    const vals = [5, 1, 3, 2, 4];
    const copy = [...vals];
    quantile(vals, 0.5);
    expect(vals).toEqual(copy);
  });

  it('throw si q hors [0,1]', () => {
    expect(() => quantile([1, 2, 3], -0.1)).toThrow();
    expect(() => quantile([1, 2, 3], 1.5)).toThrow();
  });
});

describe('computeOrderDurations()', () => {
  it('returns null/null si paidAt manquant', () => {
    expect(computeOrderDurations(null, [])).toEqual({ submitMs: null, shipMs: null });
  });

  it('returns null/null si aucun SUBMITTED event', () => {
    const paidAt = new Date('2026-05-01T10:00:00Z');
    const events = [
      { kind: 'PAYMENT_SUCCEEDED', data: null, createdAt: paidAt },
    ];
    expect(computeOrderDurations(paidAt, events)).toEqual({ submitMs: null, shipMs: null });
  });

  it('calcul submitMs depuis paidAt → SUBMITTED', () => {
    const paidAt = new Date('2026-05-01T10:00:00Z');
    const submittedAt = new Date('2026-05-01T12:30:00Z'); // 2.5h plus tard
    const events = [
      { kind: 'PAYMENT_SUCCEEDED', data: null, createdAt: paidAt },
      { kind: 'SINALITE_SUBMITTED', data: null, createdAt: submittedAt },
    ];
    const r = computeOrderDurations(paidAt, events);
    expect(r.submitMs).toBe(2.5 * 60 * 60 * 1000);
    expect(r.shipMs).toBe(null);
  });

  it('calcul shipMs depuis SUBMITTED → SHIPPED status_changed', () => {
    const paidAt = new Date('2026-05-01T10:00:00Z');
    const submittedAt = new Date('2026-05-01T12:00:00Z');
    const shippedAt = new Date('2026-05-03T12:00:00Z'); // 48h plus tard
    const events = [
      { kind: 'PAYMENT_SUCCEEDED', data: null, createdAt: paidAt },
      { kind: 'SINALITE_SUBMITTED', data: null, createdAt: submittedAt },
      { kind: 'SINALITE_STATUS_CHANGED', data: JSON.stringify({ status: 'SHIPPED' }), createdAt: shippedAt },
    ];
    const r = computeOrderDurations(paidAt, events);
    expect(r.shipMs).toBe(48 * 60 * 60 * 1000);
  });

  it('ignore STATUS_CHANGED qui ne contient pas "SHIPPED" dans data', () => {
    const paidAt = new Date('2026-05-01T10:00:00Z');
    const submittedAt = new Date('2026-05-01T12:00:00Z');
    const events = [
      { kind: 'SINALITE_SUBMITTED', data: null, createdAt: submittedAt },
      { kind: 'SINALITE_STATUS_CHANGED', data: JSON.stringify({ status: 'IN_PRODUCTION' }), createdAt: new Date('2026-05-02T12:00:00Z') },
    ];
    const r = computeOrderDurations(paidAt, events);
    expect(r.shipMs).toBe(null);
  });

  it('robust : pick le PREMIER SUBMITTED (pas le dernier) si dupliqué', () => {
    const paidAt = new Date('2026-05-01T10:00:00Z');
    const events = [
      { kind: 'SINALITE_SUBMITTED', data: null, createdAt: new Date('2026-05-01T11:00:00Z') },
      { kind: 'SINALITE_SUBMITTED', data: null, createdAt: new Date('2026-05-01T15:00:00Z') }, // duplicate
    ];
    const r = computeOrderDurations(paidAt, events);
    expect(r.submitMs).toBe(1 * 60 * 60 * 1000); // 1h, pas 5h
  });

  it('ignore SUBMITTED qui arrive AVANT paidAt (data corrupted)', () => {
    const paidAt = new Date('2026-05-01T10:00:00Z');
    const submittedAt = new Date('2026-05-01T09:00:00Z'); // before paid !
    const events = [
      { kind: 'SINALITE_SUBMITTED', data: null, createdAt: submittedAt },
    ];
    const r = computeOrderDurations(paidAt, events);
    expect(r.submitMs).toBe(null);
  });
});
