import { describe, it, expect } from 'vitest';
import { computeTaxReport, type TaxReportOrderInput } from './tax-report';

// Commande QC 100 $ HT + livraison 10 $ → taxable 110 $ ; TPS 5 % + TVQ 9,975 %.
// taxCents stocké = 1647 (arrondi réel). amountCents (charge nette) = 12147.
function qcOrder(over: Partial<TaxReportOrderInput> = {}): TaxReportOrderInput {
  return {
    id: 'o1', paidAt: new Date('2026-05-15'), shipProvince: 'QC',
    subtotalCents: 10000, discountCents: 0, resellerDiscountCents: 0,
    shippingCents: 1000, taxCents: 1647, amountCents: 12147, ...over,
  };
}

describe('computeTaxReport — NET des remboursements + split TPS/TVQ', () => {
  it('sans refund : le split TPS/TVQ somme EXACTEMENT à la taxe stockée', () => {
    const { summary, rows } = computeTaxReport([qcOrder()], []);
    expect(summary.totalTaxCents).toBe(1647);
    expect(rows[0].gstCents + rows[0].pstCents + rows[0].qstCents + rows[0].hstCents).toBe(1647);
    expect(rows[0].gstCents).toBeGreaterThan(0); // TPS
    expect(rows[0].qstCents).toBeGreaterThan(0); // TVQ
    expect(summary.refundedCents).toBe(0);
  });

  it('refund TOTAL → taxe/subtotal/charged à 0 (vente exclue de la remise)', () => {
    const refunds = [{ orderId: 'o1', data: JSON.stringify({ amountCents: 12147 }), order: { amountCents: 12147, subtotalCents: 10563, taxCents: 1584, shipProvince: 'QC' } }];
    const { summary, rows } = computeTaxReport([qcOrder()], refunds);
    expect(summary.totalTaxCents).toBe(0);
    expect(summary.totalSubtotalCents).toBe(0);
    expect(summary.totalChargedCents).toBe(0);
    expect(rows[0].totalTaxCents).toBe(0);
    expect(summary.refundedCents).toBe(12147);
  });

  it('refund PARTIEL (50 %) → taxe scalée ~50 %, split somme au net', () => {
    const refunds = [{ orderId: 'o1', data: JSON.stringify({ amountCents: 6074 }), order: { amountCents: 12147, subtotalCents: 10563, taxCents: 1584, shipProvince: 'QC' } }];
    const { summary, rows } = computeTaxReport([qcOrder()], refunds);
    // netFactor = 1 − 6074/12147 ≈ 0,5 → taxe nette ≈ 824¢.
    expect(summary.totalTaxCents).toBeGreaterThan(800);
    expect(summary.totalTaxCents).toBeLessThan(850);
    expect(rows[0].gstCents + rows[0].pstCents + rows[0].qstCents + rows[0].hstCents).toBe(summary.totalTaxCents);
  });

  it('refund > montant chargé → plafonné (jamais de valeur négative)', () => {
    const refunds = [{ orderId: 'o1', data: JSON.stringify({ amountCents: 99999 }), order: { amountCents: 12147, subtotalCents: 10563, taxCents: 1584, shipProvince: 'QC' } }];
    const { summary } = computeTaxReport([qcOrder()], refunds);
    expect(summary.totalTaxCents).toBe(0);
    expect(summary.totalSubtotalCents).toBe(0);
    expect(summary.refundedCents).toBe(12147); // plafonné à amountCents
  });

  it('agrège par province + tax-exempt (taxCents 0) → toutes lignes 0', () => {
    const exempt = qcOrder({ id: 'o2', taxCents: 0, shipProvince: 'AB' });
    const { byProvince, rows } = computeTaxReport([qcOrder(), exempt], []);
    expect(byProvince).toHaveLength(2);
    const ab = rows.find((r) => r.id === 'o2')!;
    expect(ab.totalTaxCents).toBe(0);
  });
});
