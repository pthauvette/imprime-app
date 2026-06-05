/**
 * GET /api/admin/users/export.csv
 *
 * Export CSV des utilisateurs pour CRM / mailing list / analytics.
 * Inclut LTV calculée (sum amountCents des Orders PAID/SHIPPED/DELIVERED).
 *
 * Query params optionnels :
 *   ?filter=authenticated|guest|high-value|inactive   (mirror /admin/users)
 *   ?q=string                                          (search email/name)
 *
 * Format CSV : RFC 4180 + UTF-8 BOM pour Excel. Max 10 000 rows
 * (au-delà → on demande à filtrer plus serré pour MVP).
 *
 * Auth : requireAdmin. Audit log à chaque export (PII data leak risk).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const MAX_EXPORT = 10_000;
const HIGH_VALUE_CENTS = 100_000;
const INACTIVE_DAYS = 90;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',') + '\r\n';
}

export const GET = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const filter = url.searchParams.get('filter') ?? 'all';
  const search = (url.searchParams.get('q') ?? '').trim();

  const now = new Date();
  const inactiveCutoff = new Date(now.getTime() - INACTIVE_DAYS * 24 * 3600 * 1000);

  type UserWhere = NonNullable<NonNullable<Parameters<typeof prisma.user.findMany>[0]>['where']>;
  const whereParts: UserWhere[] = [];
  if (filter === 'authenticated') whereParts.push({ emailVerified: { not: null } });
  else if (filter === 'guest') whereParts.push({ emailVerified: null });
  else if (filter === 'inactive') {
    whereParts.push({
      OR: [
        { orders: { none: {} } },
        { orders: { every: { createdAt: { lt: inactiveCutoff } } } },
      ],
    });
  }
  if (search) {
    whereParts.push({
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { name: { contains: search, mode: 'insensitive' as const } },
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName: { contains: search, mode: 'insensitive' as const } },
      ],
    });
  }
  const where: UserWhere = whereParts.length === 0 ? {} : { AND: whereParts };

  const [users, ltvAgg] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_EXPORT,
      include: { _count: { select: { orders: true } } },
    }),
    prisma.order.groupBy({
      by: ['userId'],
      _sum: { amountCents: true },
      _max: { createdAt: true },
    }),
  ]);

  const ltvByUser = new Map<string, number>();
  const lastOrderByUser = new Map<string, Date | null>();
  for (const row of ltvAgg) {
    ltvByUser.set(row.userId, row._sum.amountCents ?? 0);
    lastOrderByUser.set(row.userId, row._max.createdAt ?? null);
  }

  // Post-filter high-value (Prisma can't aggregate-filter without raw query)
  let rows = users;
  if (filter === 'high-value') {
    rows = rows.filter((u) => (ltvByUser.get(u.id) ?? 0) >= HIGH_VALUE_CENTS);
  }

  const headers = [
    'user_id',
    'email',
    'name',
    'first_name',
    'last_name',
    'phone',
    'role',
    'email_verified',
    'email_delivery_notifications',
    'referral_code',
    'referred_by_code',
    'referral_credit_cents',
    'created_at',
    'updated_at',
    'orders_count',
    'ltv_cents',
    'last_order_at',
  ];

  let csv = '﻿';
  csv += csvRow(headers);

  for (const u of rows) {
    csv += csvRow([
      u.id,
      u.email,
      u.name ?? '',
      u.firstName ?? '',
      u.lastName ?? '',
      u.phone ?? '',
      u.role,
      u.emailVerified ? 'yes' : 'no',
      u.emailDeliveryNotifications ? 'yes' : 'no',
      u.referralCode ?? '',
      u.referredByCode ?? '',
      u.referralCreditCents,
      u.createdAt.toISOString(),
      u.updatedAt.toISOString(),
      u._count.orders,
      ltvByUser.get(u.id) ?? 0,
      lastOrderByUser.get(u.id)?.toISOString() ?? '',
    ]);
  }

  // Audit (PII export — sensible)
  await recordAdminAudit({
    kind: 'ADMIN_DATA_EXPORT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    data: {
      action: 'USERS_CSV_EXPORT',
      filter,
      search,
      rowCount: rows.length,
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = [
    filter !== 'all' ? `filter-${filter}` : null,
    search ? 'with-search' : null,
  ].filter(Boolean).join('_');
  const filename = `plio-users_${stamp}${suffix ? '_' + suffix : ''}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
