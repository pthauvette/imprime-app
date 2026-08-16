/**
 * GET /api/admin/finances/tax-report.csv?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Rapport de taxes pour remise CRA (TPS) + Revenu Québec (TVQ) + HST/PST.
 * Le calcul (taxable subtotal réel + split TPS/TVQ + NET des remboursements) vit
 * dans le helper PUR `computeTaxReport` — MÊME source que la page de preview
 * (/admin/finances/tax-report) pour garantir « écran == export » (audit §4a).
 *
 * Format CSV : RFC 4180 + UTF-8 BOM pour Excel. Granularité par order, plus
 * un summary aggregé en haut (commenté CSV).
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
import { PAID_STATUSES } from '@/lib/finances/refund-amount';
import { computeTaxReport } from '@/lib/finances/tax-report';

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
      discountCents: true,
      resellerDiscountCents: true,
      shippingCents: true,
      taxCents: true,
      amountCents: true,
    },
    take: 50_000, // safety
  });

  // Audit admin 2026-07 §3.2 — refunds de la période (createdAt ∈ [from, to]) sur
  // les commandes du rapport. `computeTaxReport` les nette au prorata (helper pur).
  // ⚠️ PLUS DE FILTRE `orderId: { in: orderIds }`, ET C'EST LE CORRECTIF.
  // Un remboursement n'était déduit que si la commande avait été PAYÉE dans la
  // même fenêtre — donc une commande payée le 28 mars et remboursée le 3 avril
  // n'était réduite dans AUCUNE période. Symétrie exigée par la règle « chaque
  // événement dans sa période » : le remboursement réduit l'assiette de la
  // période où il est émis, la reprise l'augmente dans celle du démenti.
  //
  // ⚠️ FILTRE DE STATUT OBLIGATOIRE. Sans lui, une commande CANCELLED/FAILED —
  // la population DOMINANTE des `REFUND_FAILED`, puisque l'échec Sinalite
  // auto-remboursé est le chemin le plus fréquent — entrait dans l'assiette
  // TPS/TVQ par la porte de derrière, alors qu'elle n'y a jamais été.
  const refundEvents = await prisma.orderEvent.findMany({
    where: {
      kind: 'REFUND_ISSUED',
      createdAt: { gte: from, lte: toEnd },
      order: { status: { in: [...PAID_STATUSES] } },
    },
    select: {
      orderId: true,
      data: true,
      order: { select: { amountCents: true, subtotalCents: true, taxCents: true, shipProvince: true } },
    },
  });

  // ⚠️ REPRISES : `REFUND_FAILED` survenus DANS la période, sur N'IMPORTE
  // QUELLE commande — surtout PAS filtrées sur `orderIds`. Le cas qui motive
  // cette règle est justement le remboursement émis en mai et démenti en
  // juillet : la commande de mai n'est pas dans le rapport de juillet, et
  // filtrer sur les commandes du rapport perdrait exactement ce cas-là.
  const repriseEvents = await prisma.orderEvent.findMany({
    where: {
      kind: 'REFUND_FAILED',
      createdAt: { gte: from, lte: toEnd },
      order: { status: { in: [...PAID_STATUSES] } },
    },
    select: {
      orderId: true,
      data: true,
      order: { select: { amountCents: true, subtotalCents: true, taxCents: true, shipProvince: true } },
    },
  });

  const { rows, summary, byProvince } = computeTaxReport(orders, refundEvents, repriseEvents);

  // CSV : UTF-8 BOM + summary commentary + headers + rows
  let csv = '﻿';
  csv += `# Plio — Tax report ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}\r\n`;
  csv += `# Generated by ${guard.user.email} at ${new Date().toISOString()}\r\n`;
  csv += `# Orders included: ${summary.orderCount} (status IN PAID/SUBMITTED/IN_PROD/SHIPPED/DELIVERED)\r\n`;
  // ⚠️ DEUX LIGNES DISTINCTES, ET C'EST UNE CORRECTION. Une seule ligne
  // annonçait `refundedCents` comme « le montant qui a réduit l'assiette » —
  // or ce compteur ne couvre QUE les commandes du rapport. Depuis que la
  // soustraction est symétrique, les remboursements sur commandes hors période
  // réduisent aussi l'assiette, et n'y figuraient pas : l'en-tête affirmait
  // zéro pendant que le total plongeait.
  csv += `# Refunds netted, commandes DE LA PÉRIODE (cents): ${summary.refundedCents} — subtotal/tax/charged réduits au prorata\r\n`;
  csv += `# Ajustement NET sur commandes HORS période (cents, signé): ${summary.ajustementHorsPeriodeCents} — négatif = remboursement tardif qui retranche ; positif = reprise qui rend\r\n`;
  csv += `# Reprises de remboursement (cents): ${summary.repriseCents} — REFUND_FAILED de la période : Stripe a ANNULÉ ces remboursements, l'argent est revenu chez Plio\r\n`;
  csv += `#   dont sur commandes HORS période (cents): ${summary.repriseHorsPeriodeCents}\r\n`;
  csv += `#\r\n`;
  csv += `# ⚠️ Les lignes marquées is_adjustment=1 portent sur des commandes d'une AUTRE période\r\n`;
  csv += `#   (paid_at vide). Elles sont incluses dans les totaux ci-dessus : la colonne\r\n`;
  csv += `#   total_tax_cents somme donc exactement à « Total tax collected ».\r\n`;
  csv += `# Subtotal total (NET des remboursements, cents): ${summary.totalSubtotalCents}\r\n`;
  csv += `# GST collected (cents): ${summary.gstCents}\r\n`;
  csv += `# PST collected (cents): ${summary.pstCents}\r\n`;
  csv += `# QST collected (cents): ${summary.qstCents}\r\n`;
  csv += `# HST collected (cents): ${summary.hstCents}\r\n`;
  csv += `# Total tax collected (cents): ${summary.totalTaxCents}\r\n`;
  csv += `# Total charged (cents): ${summary.totalChargedCents}\r\n`;
  csv += `#\r\n`;
  csv += `# Per-province :\r\n`;
  for (const stat of byProvince.slice().sort((a, b) => a.province.localeCompare(b.province))) {
    csv += `#   ${stat.province}: ${stat.count} orders · subtotal $${(stat.subtotalCents / 100).toFixed(2)} · tax $${(stat.taxCents / 100).toFixed(2)}\r\n`;
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
    'is_adjustment',
  ]);

  for (const r of rows) {
    csv += csvRow([
      r.id,
      r.paidAt ? r.paidAt.toISOString() : '',
      r.province,
      r.subtotalCents,
      r.gstCents,
      r.pstCents,
      r.qstCents,
      r.hstCents,
      r.totalTaxCents,
      r.totalChargedCents,
      r.ajustement ? 1 : 0,
    ]);
  }

  await recordAdminAudit({
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
