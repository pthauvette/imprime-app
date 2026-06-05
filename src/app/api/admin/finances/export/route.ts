/**
 * GET /api/admin/finances/export?period=30d
 *
 * Export Excel multi-sheet pour la comptabilité — 4 sheets dans un seul
 * fichier XLSX :
 *
 *   1. "Aperçu"        — KPIs de la période (revenue, count, AOV, taxes)
 *   2. "Commandes"     — toutes les orders payées avec colonnes detail
 *   3. "Par jour"      — rollup quotidien revenue + count
 *   4. "Par province"  — revenue, count, taxes groupés par province
 *
 * Vs le CSV existant (/api/admin/orders/export) : un seul fichier multi-
 * sheet vs un seul tableau plat. Plus pratique pour les comptables qui
 * pivotent dans Excel.
 *
 * Query : ?period = today | 7d | 30d | mtd | ytd  (default 30d)
 * Auth : ADMIN only. Audit log à chaque export.
 */

import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Period = 'today' | '7d' | '30d' | 'mtd' | 'ytd';
const PERIODS: readonly Period[] = ['today', '7d', '30d', 'mtd', 'ytd'] as const;

function computeRange(period: Period, now: Date): { start: Date; end: Date; label: string } {
  const end = new Date(now);
  const start = new Date(now);
  let label = '';
  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
    label = "aujourd'hui";
  } else if (period === '7d') {
    start.setTime(now.getTime() - 7 * 24 * 3600 * 1000);
    label = '7 derniers jours';
  } else if (period === '30d') {
    start.setTime(now.getTime() - 30 * 24 * 3600 * 1000);
    label = '30 derniers jours';
  } else if (period === 'mtd') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    label = `mois en cours (${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')})`;
  } else if (period === 'ytd') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    label = `année en cours (${start.getFullYear()})`;
  }
  return { start, end, label };
}

export const GET = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const periodParam = url.searchParams.get('period');
  const period: Period = (PERIODS as readonly string[]).includes(periodParam ?? '')
    ? (periodParam as Period)
    : '30d';

  const now = new Date();
  const { start, end, label } = computeRange(period, now);

  // Fetch toutes les orders payées dans la période
  const orders = await prisma.order.findMany({
    where: { paidAt: { gte: start, lt: end } },
    orderBy: { paidAt: 'asc' },
    include: {
      user: { select: { email: true, name: true } },
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Plio';
  wb.lastModifiedBy = guard.user.email;
  wb.created = now;
  wb.modified = now;

  // ─── Sheet 1: Aperçu ────────────────────────────────────────────────────
  const summary = wb.addWorksheet('Aperçu', {
    properties: { tabColor: { argb: 'FF1F3D2B' } },
  });
  summary.columns = [
    { header: 'Indicateur', key: 'label', width: 32 },
    { header: 'Valeur', key: 'value', width: 22 },
  ];
  summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F3D2B' },
  };

  const revenue = orders.reduce((s, o) => s + o.amountCents, 0);
  const subtotal = orders.reduce((s, o) => s + o.subtotalCents, 0);
  const shipping = orders.reduce((s, o) => s + o.shippingCents, 0);
  const taxes = orders.reduce((s, o) => s + o.taxCents, 0);
  const discounts = orders.reduce((s, o) => s + (o.discountCents ?? 0), 0);
  const referralCredits = orders.reduce(
    (s, o) => s + (o.referralCreditAppliedCents ?? 0),
    0,
  );
  const aov = orders.length > 0 ? revenue / orders.length : 0;

  summary.addRows([
    { label: 'Période', value: label },
    { label: 'Du', value: start },
    { label: 'Au', value: end },
    { label: 'Nombre de commandes', value: orders.length },
    { label: 'Revenu total (CAD)', value: revenue / 100 },
    { label: 'Sous-total (HT)', value: subtotal / 100 },
    { label: 'Livraison', value: shipping / 100 },
    { label: 'Taxes collectées', value: taxes / 100 },
    { label: 'Remises promo', value: discounts / 100 },
    { label: 'Crédits parrainage utilisés', value: referralCredits / 100 },
    { label: 'Panier moyen (AOV)', value: aov / 100 },
  ]);

  // Format monetary cells (rows 5-11) as currency
  for (let r = 5; r <= 11; r++) {
    summary.getCell(`B${r + 1}`).numFmt = '#,##0.00 "$"';
  }
  // Dates
  summary.getCell('B2').numFmt = 'yyyy-mm-dd hh:mm';
  summary.getCell('B3').numFmt = 'yyyy-mm-dd hh:mm';

  // ─── Sheet 2: Commandes ─────────────────────────────────────────────────
  const ordersSheet = wb.addWorksheet('Commandes', {
    properties: { tabColor: { argb: 'FF4A554D' } },
  });
  ordersSheet.columns = [
    { header: 'Date paiement', key: 'paidAt', width: 18 },
    { header: 'ID Plio', key: 'id', width: 26 },
    { header: 'ID Sinalite', key: 'sinaliteId', width: 14 },
    { header: 'Statut', key: 'status', width: 14 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Nom', key: 'name', width: 22 },
    { header: 'Produit', key: 'product', width: 30 },
    { header: 'Items', key: 'itemsCount', width: 8 },
    { header: 'Sous-total', key: 'subtotal', width: 12 },
    { header: 'Livraison', key: 'shipping', width: 12 },
    { header: 'Taxes', key: 'tax', width: 10 },
    { header: 'Remise', key: 'discount', width: 10 },
    { header: 'Total CAD', key: 'amount', width: 12 },
    { header: 'Province', key: 'province', width: 10 },
    { header: 'Ville', key: 'city', width: 18 },
    { header: 'Méthode livraison', key: 'shippingMethod', width: 20 },
  ];
  ordersSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ordersSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4A554D' },
  };
  ordersSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const o of orders) {
    ordersSheet.addRow({
      paidAt: o.paidAt,
      id: o.id,
      sinaliteId: o.sinaliteOrderId ?? '',
      status: o.status,
      email: o.user.email,
      name: o.user.name ?? '',
      product: o.productSummary ?? '',
      itemsCount: o.itemsCount,
      subtotal: o.subtotalCents / 100,
      shipping: o.shippingCents / 100,
      tax: o.taxCents / 100,
      discount: (o.discountCents ?? 0) / 100,
      amount: o.amountCents / 100,
      province: o.shipProvince,
      city: o.shipCity,
      shippingMethod: o.shippingMethod,
    });
  }
  // Monetary columns
  ['I', 'J', 'K', 'L', 'M'].forEach((col) => {
    ordersSheet.getColumn(col).numFmt = '#,##0.00';
  });
  ordersSheet.getColumn('A').numFmt = 'yyyy-mm-dd hh:mm';

  // ─── Sheet 3: Par jour ──────────────────────────────────────────────────
  const dailySheet = wb.addWorksheet('Par jour', {
    properties: { tabColor: { argb: 'FF4A554D' } },
  });
  dailySheet.columns = [
    { header: 'Jour (YYYY-MM-DD)', key: 'day', width: 18 },
    { header: 'Nb commandes', key: 'count', width: 14 },
    { header: 'Revenu CAD', key: 'revenue', width: 14 },
    { header: 'Taxes CAD', key: 'tax', width: 14 },
  ];
  dailySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  dailySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4A554D' },
  };

  const dailyMap = new Map<string, { count: number; revenue: number; tax: number }>();
  for (const o of orders) {
    if (!o.paidAt) continue;
    const day = o.paidAt.toISOString().slice(0, 10);
    const existing = dailyMap.get(day) ?? { count: 0, revenue: 0, tax: 0 };
    existing.count += 1;
    existing.revenue += o.amountCents;
    existing.tax += o.taxCents;
    dailyMap.set(day, existing);
  }
  const sortedDays = [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [day, agg] of sortedDays) {
    dailySheet.addRow({
      day,
      count: agg.count,
      revenue: agg.revenue / 100,
      tax: agg.tax / 100,
    });
  }
  ['C', 'D'].forEach((col) => {
    dailySheet.getColumn(col).numFmt = '#,##0.00';
  });

  // ─── Sheet 4: Par province ──────────────────────────────────────────────
  const provSheet = wb.addWorksheet('Par province', {
    properties: { tabColor: { argb: 'FF4A554D' } },
  });
  provSheet.columns = [
    { header: 'Province', key: 'prov', width: 12 },
    { header: 'Nb commandes', key: 'count', width: 14 },
    { header: 'Revenu CAD', key: 'revenue', width: 14 },
    { header: 'Taxes CAD', key: 'tax', width: 14 },
    { header: 'Panier moyen', key: 'aov', width: 14 },
  ];
  provSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  provSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4A554D' },
  };

  const provMap = new Map<string, { count: number; revenue: number; tax: number }>();
  for (const o of orders) {
    const existing = provMap.get(o.shipProvince) ?? { count: 0, revenue: 0, tax: 0 };
    existing.count += 1;
    existing.revenue += o.amountCents;
    existing.tax += o.taxCents;
    provMap.set(o.shipProvince, existing);
  }
  const sortedProvs = [...provMap.entries()].sort(([, a], [, b]) => b.revenue - a.revenue);
  for (const [prov, agg] of sortedProvs) {
    provSheet.addRow({
      prov,
      count: agg.count,
      revenue: agg.revenue / 100,
      tax: agg.tax / 100,
      aov: agg.count > 0 ? agg.revenue / 100 / agg.count : 0,
    });
  }
  ['C', 'D', 'E'].forEach((col) => {
    provSheet.getColumn(col).numFmt = '#,##0.00';
  });

  // ─── Output ─────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();

  await recordAdminAudit({
    kind: 'ADMIN_DATA_EXPORT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: guard.user.id,
    data: {
      action: 'FINANCES_XLSX_EXPORT',
      period,
      ordersCount: orders.length,
      revenueCents: revenue,
    },
  });

  const dateStr = now.toISOString().slice(0, 10);
  const filename = `plio-finances-${period}-${dateStr}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
