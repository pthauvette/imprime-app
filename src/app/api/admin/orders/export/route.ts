/**
 * GET /api/admin/orders/export.csv
 *
 * Export CSV des commandes pour comptabilité (QuickBooks import,
 * réconciliation bancaire, etc.).
 *
 * Query params optionnels :
 *   ?from=YYYY-MM-DD       (incluant)
 *   ?to=YYYY-MM-DD         (excluant — typique : mois complet)
 *   ?status=PAID,SHIPPED   (CSV de statuses à inclure)
 *   ?dateField=paidAt|createdAt (défaut createdAt — compat). Audit admin
 *     2026-07 §3.4 : l'export XLSX finances filtre par paidAt (revenu reconnu
 *     au paiement) alors que ce CSV filtrait par createdAt → une commande créée
 *     le 30 juin, payée le 2 juillet, tombait dans des mois différents selon le
 *     fichier. Pour un rapprochement comptable, passer dateField=paidAt (les
 *     commandes jamais payées — paidAt null — sont alors exclues).
 *
 * Format CSV : RFC 4180 compliant. UTF-8 BOM en début pour Excel
 * (sinon Excel mal interprète les caractères accentués).
 *
 * Auth : requireAdmin. Audit log à chaque export.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

/** RFC 4180 escape : double-quote inside string + wrap si contient
 *  comma, quote, newline. Sinon retourne tel quel. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',') + '\r\n';
}

export const GET = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const statusParam = url.searchParams.get('status');
  // §3.4 — champ de date du filtre (createdAt = compat ; paidAt = comptable).
  const dateField: 'createdAt' | 'paidAt' =
    url.searchParams.get('dateField') === 'paidAt' ? 'paidAt' : 'createdAt';

  const where: Parameters<typeof prisma.order.findMany>[0] extends infer T
    ? T extends { where?: infer W } ? W : never : never = {};
  type DateRange = { gte?: Date; lt?: Date };
  const rangeTarget = where as Record<'createdAt' | 'paidAt', DateRange | undefined>;
  if (fromParam) {
    const d = new Date(fromParam);
    if (!isNaN(d.getTime())) {
      rangeTarget[dateField] = { ...rangeTarget[dateField], gte: d };
    }
  }
  if (toParam) {
    const d = new Date(toParam);
    if (!isNaN(d.getTime())) {
      rangeTarget[dateField] = { ...rangeTarget[dateField], lt: d };
    }
  }
  if (statusParam) {
    const statuses = statusParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      (where as { status?: { in: string[] } }).status = { in: statuses };
    }
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { [dateField]: 'desc' },
    include: { user: { select: { email: true } } },
    take: 5000, // safety guardrail, ~6 mois de volume modéré
  });

  // Build CSV
  const headers = [
    'order_id',
    'sinalite_order_id',
    'created_at',
    'paid_at',
    'status',
    'customer_email',
    'product_summary',
    'items_count',
    'subtotal_cents',
    'discount_cents',
    'referral_credit_cents',
    'shipping_cents',
    'tax_cents',
    'amount_cents',
    'currency',
    'shipping_method',
    'ship_name',
    'ship_city',
    'ship_province',
    'ship_postal_code',
  ];

  // UTF-8 BOM (U+FEFF) — Excel ne décode pas les accents UTF-8 par
  // défaut sans BOM. Le ﻿ explicit garantit qu'on a bien le
  // codepoint, indépendamment de comment l'éditeur sauvegarde le fichier.
  let csv = '﻿';
  csv += csvRow(headers);

  for (const o of orders) {
    csv += csvRow([
      o.id,
      o.sinaliteOrderId ?? '',
      o.createdAt.toISOString(),
      o.paidAt?.toISOString() ?? '',
      o.status,
      o.user.email,
      o.productSummary ?? '',
      o.itemsCount,
      o.subtotalCents,
      o.discountCents,
      o.referralCreditAppliedCents,
      o.shippingCents,
      o.taxCents,
      o.amountCents,
      o.currency,
      o.shippingMethod,
      o.shipName,
      o.shipCity,
      o.shipProvince,
      o.shipPostalCode,
    ]);
  }

  // Audit log (best-effort, ne fail pas l'export)
  await recordAdminAudit({
    kind: 'ADMIN_DATA_EXPORT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    data: {
      action: 'ORDERS_CSV_EXPORT',
      from: fromParam,
      to: toParam,
      status: statusParam,
      dateField,
      rowCount: orders.length,
    },
  });

  // Filename : timestamped, includes filters
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = [
    fromParam ? `from-${fromParam}` : null,
    toParam ? `to-${toParam}` : null,
    statusParam ? `status-${statusParam}` : null,
  ].filter(Boolean).join('_');
  const filename = `plio-orders_${stamp}${suffix ? '_' + suffix : ''}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
