/**
 * GET /api/cron/reseller-monthly-stats
 *
 * Round 24 #4. Le 1er du mois à 08h UTC (après reseller-detection 07h UTC),
 * compute les stats du mois écoulé pour chaque reseller VERIFIED ou
 * AUTO_DETECTED qui a au moins 1 order payée le mois passé.
 *
 * Pour chacun :
 *   - count des orders payées (status hors CANCELLED/FAILED)
 *   - revenue (sum amountCents)
 *   - rabais reseller cumulé (5 % du revenue si VERIFIED, 0 sinon — basé sur
 *     resellerDiscountCents snapshot par order, fallback 5 % du total)
 *   - comparison vs mois précédent
 *
 * Email gated par user.emailMarketing (récap = marketing, pas transactional).
 *
 * Auth : Bearer CRON_SECRET. À schedule via GH Actions
 * .github/workflows/cron-reseller-monthly-stats.yml
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { sendResellerMonthlyStatsEmail } from '@/lib/emails/send';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import type { ResellerMonthlyStatsVars } from '@/lib/emails/vars';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatCentsCa(cents: number): string {
  return (cents / 100).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function firstNameOf(u: { firstName: string | null; name: string | null; email: string }): string {
  return u.firstName ?? u.name?.split(' ')[0] ?? u.email.split('@')[0];
}

/**
 * Borne UTC : [début du mois écoulé, début du mois courant).
 * Si on est le 1er mai 2026 à 08h UTC → window [2026-04-01 UTC, 2026-05-01 UTC).
 */
function lastMonthWindow(now: Date): { start: Date; end: Date; monthKey: string; monthLabel: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); // début mois courant
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = start.getUTCFullYear();
  const monthIdx = start.getUTCMonth();
  const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  const monthLabel = `${MONTH_NAMES[monthIdx]} ${year}`;
  return { start, end, monthKey, monthLabel };
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'reseller-monthly-stats');
  if (denied) return denied;

  const startTs = Date.now();
  const now = new Date();
  const { start, end, monthKey, monthLabel } = lastMonthWindow(now);

  // Mois précédent encore en arrière (pour comparison)
  const prevStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));

  let sentCount = 0;
  let skippedOptOut = 0;
  let zeroOrderResellers = 0;
  let skippedDuplicate = 0;

  try {
    // 1. Get tous les resellers actifs (VERIFIED OR AUTO_DETECTED)
    const resellers = await prisma.user.findMany({
      where: {
        resellerStatus: { in: ['VERIFIED', 'AUTO_DETECTED'] },
      },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        resellerStatus: true,
        emailMarketing: true,
      },
    });

    if (resellers.length === 0) {
      const result = { ok: true, latencyMs: Date.now() - startTs, sent: 0, scanned: 0, monthKey };
      void pingCronHealthcheck('reseller-monthly-stats', 'success', result);
      void recordCronRun({ name: 'reseller-monthly-stats', status: 'success', latencyMs: Date.now() - startTs, data: result });
      return NextResponse.json(result);
    }

    // 2. Groupby orders du mois écoulé par userId
    const lastMonthGroups = await prisma.order.groupBy({
      by: ['userId'],
      where: {
        userId: { in: resellers.map((r) => r.id) },
        paidAt: { gte: start, lt: end },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      _sum: { amountCents: true, resellerDiscountCents: true },
      _count: { _all: true },
    });

    const lastMonthByUser = new Map(lastMonthGroups.map((g) => [g.userId, g]));

    // 3. Groupby orders du mois précédent (comparison)
    const prevMonthGroups = await prisma.order.groupBy({
      by: ['userId'],
      where: {
        userId: { in: resellers.map((r) => r.id) },
        paidAt: { gte: prevStart, lt: start },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      _count: { _all: true },
    });

    const prevMonthCountByUser = new Map(prevMonthGroups.map((g) => [g.userId, g._count._all]));

    // 4. Envoie un email par reseller qui a au moins 1 order
    for (const r of resellers) {
      const grp = lastMonthByUser.get(r.id);
      if (!grp || grp._count._all === 0) {
        zeroOrderResellers++;
        continue;
      }

      // Audit v2 #7.1 — dedup par label : queueEmail ne consulte PAS le label,
      // donc sans ce pré-check un re-run du cron (retry GH Actions) renvoyait 2×
      // le récap à chaque reseller B2B. Même garde que re-engagement.
      const dedupLabel = `reseller-monthly-stats:${r.id}:${monthKey}`;
      const alreadySent = await prisma.emailDelivery.findFirst({
        where: { label: dedupLabel },
        select: { id: true },
      });
      if (alreadySent) {
        skippedDuplicate++;
        continue;
      }

      const ordersCount = grp._count._all;
      const revenueCents = grp._sum.amountCents ?? 0;
      const discountCents = grp._sum.resellerDiscountCents ?? 0;
      const prevCount = prevMonthCountByUser.get(r.id) ?? 0;

      // Comparison label
      let comparisonLabel = '';
      let comparisonDetail = '';
      if (prevCount === 0) {
        comparisonLabel = 'Premier mois actif récemment.';
        comparisonDetail = 'Continue d\'enchaîner les commandes pour stabiliser ton statut reseller.';
      } else {
        const diffPct = Math.round(((ordersCount - prevCount) / prevCount) * 100);
        const sign = diffPct >= 0 ? '+' : '';
        comparisonLabel = `vs mois précédent : ${sign}${diffPct} %`;
        comparisonDetail = `(${prevCount} commande${prevCount !== 1 ? 's' : ''} le mois précédent, ${ordersCount} ce mois-ci)`;
      }

      // Status info
      const statusHeadline = r.resellerStatus === 'VERIFIED'
        ? 'Status : RESELLER VERIFIED'
        : 'Status : RESELLER AUTO-DÉTECTÉ';
      const statusDetail = r.resellerStatus === 'VERIFIED'
        ? 'Tu profites du rabais 5 % à chaque commande. Continue à commander régulièrement pour garder ton statut.'
        : 'Tu es éligible au rabais reseller ! Confirme ton statut depuis le tableau de bord pour activer le 5 % automatique.';

      const vars: ResellerMonthlyStatsVars = {
        CUSTOMER_FIRST_NAME: firstNameOf(r),
        MONTH_LABEL: monthLabel,
        ORDERS_COUNT: ordersCount,
        REVENUE: formatCentsCa(revenueCents),
        DISCOUNT_SAVED: formatCentsCa(discountCents),
        COMPARISON_LABEL: comparisonLabel,
        COMPARISON_DETAIL: comparisonDetail,
        STATUS_HEADLINE: statusHeadline,
        STATUS_DETAIL: statusDetail,
        DASHBOARD_URL: `${APP_URL}/account`,
        UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
      };

      const send = await sendResellerMonthlyStatsEmail({
        user: r as Parameters<typeof sendResellerMonthlyStatsEmail>[0]['user'],
        vars,
        monthKey,
      });

      if (send.sent) {
        sentCount++;
      } else if ('optedOut' in send && send.optedOut) {
        skippedOptOut++;
      }
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - startTs,
      monthKey,
      scanned: resellers.length,
      sent: sentCount,
      skippedOptOut,
      skippedDuplicate,
      zeroOrderResellers,
    };
    log.info(result, 'cron/reseller-monthly-stats ran');
    void pingCronHealthcheck('reseller-monthly-stats', 'success', { sent: sentCount });
    void recordCronRun({
      name: 'reseller-monthly-stats',
      status: 'success',
      latencyMs: Date.now() - startTs,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/reseller-monthly-stats failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('reseller-monthly-stats', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'reseller-monthly-stats',
      status: 'fail',
      latencyMs: Date.now() - startTs,
      errorMessage: errMsg,
    });
    return NextResponse.json(
      { ok: false, error: errMsg, latencyMs: Date.now() - startTs },
      { status: 500 },
    );
  }
}
