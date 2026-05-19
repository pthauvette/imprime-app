/**
 * Tests pour classifyCustomer + rfmSummary.
 */

import { describe, it, expect } from 'vitest';
import { classifyCustomer, rfmSummary, daysSince } from '@/lib/customers/segment';

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

describe('classifyCustomer', () => {
  it('NEW si aucune commande', () => {
    const r = classifyCustomer({ ltvCents: 0, orderCount: 0 });
    expect(r.segment).toBe('NEW');
    expect(r.tone).toBe('muted');
  });

  it('VIP override par LTV > 1000$', () => {
    const r = classifyCustomer({
      ltvCents: 150_000,
      orderCount: 2,
      ordersLast365d: 2,
      lastOrderDate: daysAgo(200), // > 180 mais VIP override
    });
    expect(r.segment).toBe('VIP');
    expect(r.tone).toBe('accent');
    expect(r.reason).toMatch(/1500/);
  });

  it('VIP override par 5+ orders sur 365j', () => {
    const r = classifyCustomer({
      ltvCents: 50_000,
      orderCount: 6,
      ordersLast365d: 6,
      lastOrderDate: daysAgo(10),
    });
    expect(r.segment).toBe('VIP');
    expect(r.reason).toMatch(/6 commandes/);
  });

  it('ACTIVE si dernière commande < 90 jours', () => {
    const r = classifyCustomer({
      ltvCents: 20_000,
      orderCount: 2,
      ordersLast365d: 2,
      lastOrderDate: daysAgo(30),
    });
    expect(r.segment).toBe('ACTIVE');
    expect(r.tone).toBe('success');
    expect(r.reason).toMatch(/30 jour/);
  });

  it('AT_RISK si 90-180 jours sans commande', () => {
    const r = classifyCustomer({
      ltvCents: 20_000,
      orderCount: 1,
      ordersLast365d: 1,
      lastOrderDate: daysAgo(120),
    });
    expect(r.segment).toBe('AT_RISK');
    expect(r.tone).toBe('warning');
    expect(r.reason).toMatch(/120 jour/);
  });

  it('LOST si > 180 jours', () => {
    const r = classifyCustomer({
      ltvCents: 5_000,
      orderCount: 1,
      ordersLast365d: 0,
      lastOrderDate: daysAgo(200),
    });
    expect(r.segment).toBe('LOST');
    expect(r.tone).toBe('danger');
    expect(r.reason).toMatch(/REVIENS/);
  });

  it('boundary : 89 jours = ACTIVE, 90 = ACTIVE, 91 = AT_RISK', () => {
    expect(classifyCustomer({
      ltvCents: 5000, orderCount: 1, lastOrderDate: daysAgo(89),
    }).segment).toBe('ACTIVE');
    expect(classifyCustomer({
      ltvCents: 5000, orderCount: 1, lastOrderDate: daysAgo(90),
    }).segment).toBe('ACTIVE');
    expect(classifyCustomer({
      ltvCents: 5000, orderCount: 1, lastOrderDate: daysAgo(91),
    }).segment).toBe('AT_RISK');
  });

  it('boundary : 180 jours = AT_RISK, 181 = LOST', () => {
    expect(classifyCustomer({
      ltvCents: 5000, orderCount: 1, lastOrderDate: daysAgo(180),
    }).segment).toBe('AT_RISK');
    expect(classifyCustomer({
      ltvCents: 5000, orderCount: 1, lastOrderDate: daysAgo(181),
    }).segment).toBe('LOST');
  });

  it('VIP en mode AT_RISK : VIP gagne (override LTV)', () => {
    const r = classifyCustomer({
      ltvCents: 200_000,
      orderCount: 3,
      ordersLast365d: 3,
      lastOrderDate: daysAgo(120),
    });
    expect(r.segment).toBe('VIP');
  });
});

describe('rfmSummary', () => {
  it('returns recency null si pas de dernière commande', () => {
    const r = rfmSummary({ ltvCents: 0, orderCount: 0 });
    expect(r.recencyDays).toBeNull();
    expect(r.frequencyPerYear).toBe(0);
    expect(r.monetaryDollars).toBe(0);
  });

  it('compute recency + monetary correctement', () => {
    const r = rfmSummary({
      ltvCents: 105_22,
      orderCount: 2,
      lastOrderDate: daysAgo(15),
      firstOrderDate: daysAgo(45),
    });
    expect(r.recencyDays).toBe(15);
    expect(r.monetaryDollars).toBe(105);
  });

  it('extrapolation annuelle pour la frequency', () => {
    // 4 orders sur 90 jours = ~16/an
    const r = rfmSummary({
      ltvCents: 40_000,
      orderCount: 4,
      lastOrderDate: daysAgo(5),
      firstOrderDate: daysAgo(90),
    });
    expect(r.frequencyPerYear).toBeGreaterThan(10);
    expect(r.frequencyPerYear).toBeLessThan(20);
  });

  it('minimum tenure 30 jours pour pas extrapoler à l\'infini', () => {
    // 2 orders dans la dernière semaine ne doit pas dire "104/an"
    const r = rfmSummary({
      ltvCents: 20_000,
      orderCount: 2,
      lastOrderDate: daysAgo(1),
      firstOrderDate: daysAgo(7),
    });
    // 2/30 * 365 ≈ 24
    expect(r.frequencyPerYear).toBeLessThan(30);
  });
});

describe('daysSince', () => {
  it('arrondit inférieur', () => {
    const halfDay = new Date(Date.now() - 12 * 3600 * 1000);
    expect(daysSince(halfDay)).toBe(0);
  });

  it('exact 1 jour', () => {
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    expect(daysSince(d)).toBe(1);
  });
});
