/**
 * GET /api/cron/daily-summary
 *
 * Compute les KPIs des dernières 24h + envoie un récap par email à chaque
 * adresse listée dans ADMIN_EMAILS. À hit chaque matin (7h Montréal = 11h
 * UTC) via GH Actions cron — voir .github/workflows/cron-daily-summary.yml.
 *
 * Auth : header `Authorization: Bearer ${CRON_SECRET}` (même secret que
 * /api/cron/cleanup). Refuse en prod si CRON_SECRET manque.
 *
 * KPIs calculés :
 *   - revenue & orders count 24h vs 24h-précédentes
 *   - failures 24h (status=FAILED)
 *   - pipeline snapshot (counts par status, tous les orders)
 *   - new users 24h
 *   - panier moyen 24h
 *   - top 3 failed orders (id, montant, raison) si applicable
 *
 * Retourne JSON avec les KPIs + le statut d'envoi par destinataire.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { sendAdminDailySummaryEmail } from '@/lib/emails/send';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import type { AdminDailySummaryVars } from '@/lib/emails/vars';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

const cad = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

const dateFrLong = (d: Date) =>
  d.toLocaleDateString('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

function countStatus(
  groups: { status: string; _count: { _all: number } }[],
  wanted: string[],
): number {
  return groups
    .filter((g) => wanted.includes(g.status))
    .reduce((a, c) => a + c._count._all, 0);
}

function buildHeadline(orders: number, revenue: number, failures: number): {
  headline: string;
  preview: string;
} {
  if (failures > 0) {
    return {
      headline: `⚠ ${failures} échec${failures > 1 ? 's' : ''} hier — vérifier`,
      preview: `${orders} commande${orders > 1 ? 's' : ''} · ${cad(revenue * 100)} $ · ${failures} à investiguer`,
    };
  }
  if (orders === 0) {
    return {
      headline: 'Journée tranquille — 0 commande',
      preview: 'Aucune commande dans les 24 dernières heures.',
    };
  }
  if (orders === 1) {
    return {
      headline: `1 commande hier · ${cad(revenue * 100)} $`,
      preview: `Une commande de ${cad(revenue * 100)} $.`,
    };
  }
  return {
    headline: `${orders} commandes hier · ${cad(revenue * 100)} $`,
    preview: `${orders} commandes pour ${cad(revenue * 100)} $ — détails ci-dessous.`,
  };
}

function buildFailuresBlock(
  failures: { id: string; sinaliteOrderId: string | null; amountCents: number; failureReason: string | null }[],
): string {
  if (failures.length === 0) return '';
  const rows = failures
    .slice(0, 3)
    .map((f) => {
      const display = f.sinaliteOrderId
        ? `#SIN-${f.sinaliteOrderId}`
        : `#${f.id.slice(-6).toUpperCase()}`;
      const reason = (f.failureReason ?? 'raison non enregistrée').slice(0, 90);
      return `<tr>
        <td style="padding:8px 12px 8px 0; font-family:'JetBrains Mono', monospace; font-size:12px; color:#141C16; white-space:nowrap;"><a href="${APP_URL}/admin/orders/${f.id}" style="color:#1F3D2B;">${display}</a></td>
        <td style="padding:8px 12px 8px 0; font-size:12px; color:#4A554D;">${reason}</td>
        <td style="padding:8px 0; text-align:right; font-family:'JetBrains Mono', monospace; font-size:12px; color:#B83A2C;">${cad(f.amountCents)} $</td>
      </tr>`;
    })
    .join('');
  const more = failures.length > 3 ? `<div style="font-size:11px; color:#7A8780; margin-top:6px;">+ ${failures.length - 3} autres dans <a href="${APP_URL}/admin/orders?status=FAILED" style="color:#7A8780;">l'admin</a></div>` : '';
  return `<div style="border-top:1px solid #ECEAE3; padding-top:16px;">
    <div style="font-family:'JetBrains Mono', monospace; font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:#B83A2C; font-weight:600; margin-bottom:8px;">⚠ ÉCHECS À VÉRIFIER</div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">${rows}</table>
    ${more}
  </div>`;
}

export async function GET(req: NextRequest) {
  // Auth — refuse si pas configuré (prod) ou si header manque/mismatch.
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      log.error('cron/daily-summary: CRON_SECRET not set in production');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    log.warn('cron/daily-summary: CRON_SECRET not set — allowing in non-prod');
  } else {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (ADMIN_EMAILS.length === 0) {
    return NextResponse.json(
      { error: 'No ADMIN_EMAILS configured — no recipients' },
      { status: 503 },
    );
  }

  const start = Date.now();
  const now = new Date();
  const last24hStart = new Date(now.getTime() - 24 * 3600 * 1000);

  try {
  // Fetch tout en parallèle
  const [
    rev24h,
    statusGroups,
    newUsers,
    failedOrders,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { paidAt: { gte: last24hStart } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.user.count({
      where: { createdAt: { gte: last24hStart } },
    }),
    prisma.order.findMany({
      where: {
        status: 'FAILED',
        updatedAt: { gte: last24hStart },
      },
      select: {
        id: true,
        sinaliteOrderId: true,
        amountCents: true,
        failureReason: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
  ]);

  const orders24h = rev24h._count._all;
  const revenue24h = (rev24h._sum.amountCents ?? 0) / 100;
  const failures24h = failedOrders.length;
  const avgBasket = orders24h > 0 ? revenue24h / orders24h : 0;
  const { headline, preview } = buildHeadline(orders24h, revenue24h, failures24h);

  const vars: AdminDailySummaryVars = {
    DATE_FORMATTED: dateFrLong(now),
    HEADLINE: headline,
    HEADLINE_PREVIEW: preview,
    REVENUE_24H: cad(revenue24h * 100),
    ORDERS_24H: orders24h,
    FAILURES_24H: failures24h,
    FAILURES_COLOR: failures24h > 0 ? '#B83A2C' : '#4A554D',
    FAILURES_BLOCK_HTML: buildFailuresBlock(failedOrders),
    COUNT_PAID: countStatus(statusGroups, ['PAID']),
    COUNT_SUBMITTED: countStatus(statusGroups, ['SUBMITTED']),
    COUNT_IN_PRODUCTION: countStatus(statusGroups, ['IN_PRODUCTION']),
    COUNT_SHIPPED: countStatus(statusGroups, ['SHIPPED']),
    COUNT_DELIVERED: countStatus(statusGroups, ['DELIVERED']),
    COUNT_FAILED: countStatus(statusGroups, ['FAILED', 'CANCELLED']),
    NEW_USERS_24H: newUsers,
    NEW_USERS_PLURAL: newUsers === 1 ? '' : 's',
    AVG_BASKET: cad(avgBasket * 100),
    DASHBOARD_URL: `${APP_URL}/admin`,
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
  };

  // Send to each admin email, parallel. Capture success/fail per recipient.
  const sends = await Promise.all(
    ADMIN_EMAILS.map(async (to) => {
      const r = await sendAdminDailySummaryEmail({ to, vars });
      return { to, sent: r.sent };
    }),
  );

  const result = {
    ok: true,
    latencyMs: Date.now() - start,
    kpis: {
      orders24h,
      revenue24h,
      failures24h,
      newUsers,
      avgBasket,
    },
    recipients: sends,
  };
    log.info(result, 'cron/daily-summary ran');
    void pingCronHealthcheck('daily-summary', 'success', { orders24h, revenue24h });
    void recordCronRun({
      name: 'daily-summary',
      status: 'success',
      latencyMs: Date.now() - start,
      data: { orders24h, revenue24h, recipients: sends.length },
    });
    return NextResponse.json(result);
  } catch (err) {
    // Round 14 #4 — was missing : sans ce catch, un throw skip
    // recordCronRun('fail') + healthcheck fail → Healthchecks.io ne détecte
    // qu'au timeout next-ping.
    log.error({ err }, 'cron/daily-summary failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('daily-summary', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'daily-summary',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
    });
    return NextResponse.json(
      { ok: false, error: errMsg, latencyMs: Date.now() - start },
      { status: 500 },
    );
  }
}
