/**
 * GET /api/account/orders/export.csv
 *
 * Round 28 #2. Export CSV self-serve des commandes du customer courant
 * (audit comptable perso, sauvegarde en cas de delete du compte, etc.).
 *
 * Mirror du Round 17 #1 /api/admin/orders/export mais scope = session.user.id
 * uniquement. Pas de filtres admin (from/to/status), juste tout.
 *
 * Pas d'audit log : c'est leur propre data, déjà loggable via PIPEDA
 * data-export. Pas besoin de tracer chaque CSV.
 *
 * Rate-limit `signin` bucket (5/15min/IP) : anti-abuse léger.
 *
 * Pourquoi pas reutiliser /api/account/data-export :
 *   - data-export = JSON dump complet (toutes les tables)
 *   - orders/export = CSV scoped (orders seulement, format
 *     comptable QuickBooks-friendly)
 *   - Deux use cases distincts.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** RFC 4180 escape (copié du admin export — duplication minime acceptée
 *  pour éviter d'importer un module admin depuis customer surface). */
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }
  const userId = session.user.id;
  const userEmail = session.user.email ?? '';

  // Rate-limit anti-abuse léger
  const limit = await rateLimit('signin', clientIp(req));
  if (!limit.ok) return limit.response;

  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      sinaliteOrderId: true,
      createdAt: true,
      paidAt: true,
      status: true,
      productSummary: true,
      itemsCount: true,
      subtotalCents: true,
      discountCents: true,
      referralCreditAppliedCents: true,
      walletCreditAppliedCents: true,
      resellerDiscountCents: true,
      shippingCents: true,
      taxCents: true,
      amountCents: true,
      currency: true,
      shippingMethod: true,
      shipName: true,
      shipCity: true,
      shipProvince: true,
      shipPostalCode: true,
    },
  });

  const headers = [
    'order_id',
    'sinalite_order_id',
    'created_at',
    'paid_at',
    'status',
    'product_summary',
    'items_count',
    'subtotal_cents',
    'discount_cents',
    'referral_credit_cents',
    'wallet_credit_cents',
    'reseller_discount_cents',
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

  // UTF-8 BOM pour Excel (sinon accents fr-CA cassés)
  let csv = '﻿';
  csv += csvRow(headers);
  for (const o of orders) {
    csv += csvRow([
      o.id,
      o.sinaliteOrderId ?? '',
      o.createdAt.toISOString(),
      o.paidAt?.toISOString() ?? '',
      o.status,
      o.productSummary ?? '',
      o.itemsCount,
      o.subtotalCents,
      o.discountCents,
      o.referralCreditAppliedCents,
      o.walletCreditAppliedCents,
      o.resellerDiscountCents,
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

  log.info({ userId, rowCount: orders.length }, 'customer orders CSV export');

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `plio-mes-commandes_${userEmail.replace(/[^a-z0-9]/gi, '_')}_${stamp}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
