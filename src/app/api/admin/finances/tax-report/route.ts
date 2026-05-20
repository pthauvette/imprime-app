/**
 * GET /api/admin/finances/tax-report.csv?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Rapport de taxes pour remise CRA (TPS) + Revenu Québec (TVQ) + HST/PST.
 * On reconstitue le breakdown depuis Order.subtotalCents + shipProvince
 * via computeTax() — Order.taxCents en DB est juste le total (pas le split).
 *
 * Format CSV : RFC 4180 + UTF-8 BOM pour Excel. Granularité par order, plus
 * un summary aggregé en haut (commenté CSV).
 *
 * Colonnes :
 *   order_id, paid_at, province, subtotal_cents,
 *   gst_cents, pst_cents, qst_cents, hst_cents, total_tax_cents,
 *   total_charged_cents
 *
 * Defaults : from=début de trimestre, to=today (couvre le trimestre courant).
 * Filtre : status IN (PAID, SUBMITTED, IN_PRODUCTION, SHIPPED, DELIVERED)
 * — on exclut PENDING/CANCELLED/FAILED qui n'ont pas généré de revenu net.
 *
 * Auth admin. Audit log de chaque export (PII data leak + fiscal).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { computeTax } from '@/lib/taxes';
import type { CaProvince } from '@/lib/sinalite/types';

const PAID_STATUSES = ['PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',') + '\r\n';
}

function defaultQuarterStart(): Date {
  const now = new Date();
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  return new Date(now.getFullYear(), quarterStartMonth, 1);
}

export const GET = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  const from = fromParam ? new Date(fromParam) : defaultQuarterStart();
  const to = toParam ? new Date(toParam) : new Date();
  // Inclusif sur la day boundary de `to` (end of day)
  const toEnd = new Date(to);
  toEnd.setUTCHours(23, 59, 59, 999);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...PAID_STATUSES] },
      paidAt: { gte: from, lte: toEnd, not: null },
    },
    orderBy: { paidAt: 'asc' },
    select: {
      id: true,
      paidAt: true,
      shipProvince: true,
      subtotalCents: true,
      taxCents: true,
      amountCents: true,
    },
    take: 50_000, // safety
  });

  // Summary aggregates by tax code
  const summary = {
    gstCents: 0,
    pstCents: 0,
    qstCents: 0,
    hstCents: 0,
    totalSubtotalCents: 0,
    totalTaxCents: 0,
    totalChargedCents: 0,
    orderCount: 0,
  };
  // Per-province for reconciliation
  const byProvince = new Map<string, { count: number; subtotalCents: number; taxCents: number }>();

  // Build per-order tax rows
  const orderRows: Array<{
    id: string;
    paidAt: Date;
    province: string;
    subtotalCents: number;
    gstCents: number;
    pstCents: number;
    qstCents: number;
    hstCents: number;
    totalTaxCents: number;
    totalChargedCents: number;
  }> = [];

  for (const o of orders) {
    const subtotal = o.subtotalCents / 100;
    const breakdown = computeTax(subtotal, o.shipProvince as CaProvince);
    const taxByCode = { gst: 0, pst: 0, qst: 0, hst: 0 };
    for (const line of breakdown.lines) {
      taxByCode[line.code] = Math.round(line.amount * 100);
    }
    const totalTaxCents = taxByCode.gst + taxByCode.pst + taxByCode.qst + taxByCode.hst;

    summary.gstCents += taxByCode.gst;
    summary.pstCents += taxByCode.pst;
    summary.qstCents += taxByCode.qst;
    summary.hstCents += taxByCode.hst;
    summary.totalSubtotalCents += o.subtotalCents;
    summary.totalTaxCents += totalTaxCents;
    summary.totalChargedCents += o.amountCents;
    summary.orderCount++;

    const provStat = byProvince.get(o.shipProvince) ?? { count: 0, subtotalCents: 0, taxCents: 0 };
    provStat.count++;
    provStat.subtotalCents += o.subtotalCents;
    provStat.taxCents += totalTaxCents;
    byProvince.set(o.shipProvince, provStat);

    orderRows.push({
      id: o.id,
      paidAt: o.paidAt!,
      province: o.shipProvince,
      subtotalCents: o.subtotalCents,
      gstCents: taxByCode.gst,
      pstCents: taxByCode.pst,
      qstCents: taxByCode.qst,
      hstCents: taxByCode.hst,
      totalTaxCents,
      totalChargedCents: o.amountCents,
    });
  }

  // CSV : UTF-8 BOM + summary commentary + headers + rows
  let csv = '﻿';
  csv += `# Plio — Tax report ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}\r\n`;
  csv += `# Generated by ${guard.user.email} at ${new Date().toISOString()}\r\n`;
  csv += `# Orders included: ${summary.orderCount} (status IN PAID/SUBMITTED/IN_PROD/SHIPPED/DELIVERED)\r\n`;
  csv += `# Subtotal total (cents): ${summary.totalSubtotalCents}\r\n`;
  csv += `# GST collected (cents): ${summary.gstCents}\r\n`;
  csv += `# PST collected (cents): ${summary.pstCents}\r\n`;
  csv += `# QST collected (cents): ${summary.qstCents}\r\n`;
  csv += `# HST collected (cents): ${summary.hstCents}\r\n`;
  csv += `# Total tax collected (cents): ${summary.totalTaxCents}\r\n`;
  csv += `# Total charged (cents): ${summary.totalChargedCents}\r\n`;
  csv += `#\r\n`;
  csv += `# Per-province :\r\n`;
  for (const [prov, stat] of Array.from(byProvince.entries()).sort()) {
    csv += `#   ${prov}: ${stat.count} orders · subtotal $${(stat.subtotalCents / 100).toFixed(2)} · tax $${(stat.taxCents / 100).toFixed(2)}\r\n`;
  }
  csv += `#\r\n`;

  csv += csvRow([
    'order_id',
    'paid_at',
    'province',
    'subtotal_cents',
    'gst_cents',
    'pst_cents',
    'qst_cents',
    'hst_cents',
    'total_tax_cents',
    'total_charged_cents',
  ]);

  for (const r of orderRows) {
    csv += csvRow([
      r.id,
      r.paidAt.toISOString(),
      r.province,
      r.subtotalCents,
      r.gstCents,
      r.pstCents,
      r.qstCents,
      r.hstCents,
      r.totalTaxCents,
      r.totalChargedCents,
    ]);
  }

  void recordAdminAudit({
    kind: 'ADMIN_DATA_EXPORT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    data: {
      action: 'TAX_REPORT_EXPORT',
      from: from.toISOString(),
      to: to.toISOString(),
      orderCount: summary.orderCount,
      totalTaxCents: summary.totalTaxCents,
    },
  });

  const stamp = `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="plio-tax-report_${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
