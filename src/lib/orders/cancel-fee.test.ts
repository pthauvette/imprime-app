import { describe, it, expect } from 'vitest';
import { computeCancelFeeCents } from './cancel-fee';

const base = { amountCents: 10000, itemsCount: 1, perJobFeeCents: 2500 };

describe('computeCancelFeeCents — frais d\'annulation Sinalite (F2/F3)', () => {
  it('opt-out (chargeCancelFee=false) → 0 même si SUBMITTED', () => {
    expect(computeCancelFeeCents({ ...base, status: 'SUBMITTED', chargeCancelFee: false })).toBe(0);
  });

  it('opt-in mais commande PAS encore chez l\'imprimeur (PAID) → 0 (Sinalite pas facturé)', () => {
    expect(computeCancelFeeCents({ ...base, status: 'PAID', chargeCancelFee: true })).toBe(0);
  });

  it('opt-in + SUBMITTED → frais par article', () => {
    expect(computeCancelFeeCents({ ...base, status: 'SUBMITTED', chargeCancelFee: true })).toBe(2500);
  });

  it('opt-in + IN_PRODUCTION → frais par article', () => {
    expect(computeCancelFeeCents({ ...base, status: 'IN_PRODUCTION', chargeCancelFee: true })).toBe(2500);
  });

  it('frais PAR ARTICLE : 3 articles → 3× le frais', () => {
    expect(computeCancelFeeCents({ ...base, itemsCount: 3, status: 'SUBMITTED', chargeCancelFee: true })).toBe(7500);
  });

  it('PLAFONNÉ à la part carte : frais > amountCents → capé (jamais de refund négatif)', () => {
    // 4 articles × 2500 = 10000, mais amountCents = 6000 → capé à 6000.
    const fee = computeCancelFeeCents({ amountCents: 6000, itemsCount: 4, perJobFeeCents: 2500, status: 'SUBMITTED', chargeCancelFee: true });
    expect(fee).toBe(6000);
    expect(6000 - fee).toBe(0); // refund carte = 0, jamais négatif
  });

  it('itemsCount 0 (défensif) → traité comme 1 job', () => {
    expect(computeCancelFeeCents({ ...base, itemsCount: 0, status: 'SUBMITTED', chargeCancelFee: true })).toBe(2500);
  });

  it('perJobFeeCents mal formé (NaN/négatif) → fallback 2500', () => {
    expect(computeCancelFeeCents({ ...base, perJobFeeCents: NaN, status: 'SUBMITTED', chargeCancelFee: true })).toBe(2500);
    expect(computeCancelFeeCents({ ...base, perJobFeeCents: -100, status: 'SUBMITTED', chargeCancelFee: true })).toBe(2500);
  });

  it('SHIPPED/DELIVERED ne sont pas « en production » → 0 (mais la route les bloque déjà en amont)', () => {
    expect(computeCancelFeeCents({ ...base, status: 'SHIPPED', chargeCancelFee: true })).toBe(0);
  });
});
