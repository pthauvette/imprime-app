/**
 * Calcul PUR du rapport de taxes — SOURCE UNIQUE partagée par la page de preview
 * (`/admin/finances/tax-report`) ET l'export CSV (`/api/admin/finances/tax-report`)
 * pour garantir « écran == export » par construction (audit admin 2026-07 §4a : la
 * page affichait une taxe BRUTE quand le CSV exportait une taxe NETTE des refunds).
 *
 * Deux corrections encapsulées ici :
 *  - Round 38 #2 : taxable subtotal RÉEL (subtotal − remise − remise reseller +
 *    livraison), pas subtotal seul ; le split TPS/TVQ scale sur la taxe stockée.
 *  - Audit §3.2 : NET des remboursements — chaque commande est réduite au prorata
 *    (`netFactor`) du montant remboursé dans la période (total → 0, partiel → scalé).
 */
import { computeTax } from '@/lib/taxes';
import type { CaProvince } from '@/lib/sinalite/types';
import { refundAmountCentsOf } from '@/lib/finances/refund-amount';

export interface TaxReportOrderInput {
  id: string;
  paidAt: Date | null;
  shipProvince: string;
  subtotalCents: number;
  discountCents: number;
  resellerDiscountCents: number;
  shippingCents: number;
  taxCents: number;
  amountCents: number;
}
export interface TaxReportRefundInput {
  orderId: string | null;
  data: string | null;
  order: { amountCents: number } | null;
}
export interface TaxReportRow {
  id: string;
  paidAt: Date | null;
  province: string;
  subtotalCents: number;
  gstCents: number;
  pstCents: number;
  qstCents: number;
  hstCents: number;
  totalTaxCents: number;
  totalChargedCents: number;
}
export interface TaxReportResult {
  rows: TaxReportRow[];
  summary: {
    gstCents: number;
    pstCents: number;
    qstCents: number;
    hstCents: number;
    totalSubtotalCents: number;
    totalTaxCents: number;
    totalChargedCents: number;
    orderCount: number;
    refundedCents: number;
  };
  byProvince: Array<{ province: string; count: number; subtotalCents: number; taxCents: number }>;
}

export function computeTaxReport(
  orders: TaxReportOrderInput[],
  refunds: TaxReportRefundInput[],
): TaxReportResult {
  const refundedByOrderId = new Map<string, number>();
  for (const e of refunds) {
    if (!e.orderId) continue;
    refundedByOrderId.set(e.orderId, (refundedByOrderId.get(e.orderId) ?? 0) + refundAmountCentsOf(e));
  }

  const summary = {
    gstCents: 0, pstCents: 0, qstCents: 0, hstCents: 0,
    totalSubtotalCents: 0, totalTaxCents: 0, totalChargedCents: 0,
    orderCount: 0, refundedCents: 0,
  };
  const provMap = new Map<string, { count: number; subtotalCents: number; taxCents: number }>();
  const rows: TaxReportRow[] = [];

  for (const o of orders) {
    // NET des remboursements — plafonné à amountCents (jamais négatif).
    const refundedCents = Math.min(o.amountCents, refundedByOrderId.get(o.id) ?? 0);
    const netFactor = o.amountCents > 0 ? Math.max(0, 1 - refundedCents / o.amountCents) : 1;
    summary.refundedCents += refundedCents;
    const netSubtotalCents = Math.round(o.subtotalCents * netFactor);
    const netTaxCents = Math.round(o.taxCents * netFactor);
    const netChargedCents = Math.round(o.amountCents * netFactor);

    // Taxable subtotal RÉEL (Round 38 #2). computeTax dérive le SPLIT TPS/TVQ ;
    // on scale ensuite sur la taxe nette pour préserver la somme exacte.
    const taxableSubtotal = (
      o.subtotalCents - o.discountCents - o.resellerDiscountCents + o.shippingCents
    ) / 100;
    const breakdown = computeTax(taxableSubtotal, o.shipProvince as CaProvince);
    const computedTotalCents = Math.round(breakdown.total * 100);
    const scale = computedTotalCents > 0 ? netTaxCents / computedTotalCents : 0;

    const taxByCode: Record<'gst' | 'pst' | 'qst' | 'hst', number> = { gst: 0, pst: 0, qst: 0, hst: 0 };
    for (const line of breakdown.lines) {
      taxByCode[line.code] = Math.round(line.amount * 100 * scale);
    }
    // Absorption du drift d'arrondi (≤ 1¢) sur la plus grosse ligne.
    const summedTax = taxByCode.gst + taxByCode.pst + taxByCode.qst + taxByCode.hst;
    const drift = netTaxCents - summedTax;
    if (drift !== 0 && breakdown.lines.length > 0) {
      const biggestCode = breakdown.lines.reduce((max, l) =>
        Math.round(l.amount * 100 * scale) > Math.round(max.amount * 100 * scale) ? l : max,
      ).code;
      taxByCode[biggestCode] += drift;
    }
    const totalTaxCents = taxByCode.gst + taxByCode.pst + taxByCode.qst + taxByCode.hst;

    summary.gstCents += taxByCode.gst;
    summary.pstCents += taxByCode.pst;
    summary.qstCents += taxByCode.qst;
    summary.hstCents += taxByCode.hst;
    summary.totalSubtotalCents += netSubtotalCents;
    summary.totalTaxCents += totalTaxCents;
    summary.totalChargedCents += netChargedCents;
    summary.orderCount++;

    const prov = provMap.get(o.shipProvince) ?? { count: 0, subtotalCents: 0, taxCents: 0 };
    prov.count++;
    prov.subtotalCents += netSubtotalCents;
    prov.taxCents += totalTaxCents;
    provMap.set(o.shipProvince, prov);

    rows.push({
      id: o.id,
      paidAt: o.paidAt,
      province: o.shipProvince,
      subtotalCents: netSubtotalCents,
      gstCents: taxByCode.gst,
      pstCents: taxByCode.pst,
      qstCents: taxByCode.qst,
      hstCents: taxByCode.hst,
      totalTaxCents,
      totalChargedCents: netChargedCents,
    });
  }

  const byProvince = [...provMap.entries()].map(([province, s]) => ({ province, ...s }));
  return { rows, summary, byProvince };
}
