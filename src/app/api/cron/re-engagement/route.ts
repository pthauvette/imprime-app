/**
 * GET /api/cron/re-engagement
 *
 * Cron quotidien (recommandé 1×/jour, vers 10h heure Montréal). Envoie :
 *
 *   1. Post-delivery follow-up — pour chaque order DELIVERED dont le
 *      DELIVERED webhook est arrivé il y a ~7 jours (range 6.5-7.5d
 *      pour éviter qu'un run décalé skip), si pas déjà envoyé (dedup
 *      via EmailDelivery.label = "reengagement-follow-up:<orderId>").
 *
 *   2. Win-back — pour chaque user dont la dernière commande payée a
 *      > 90 jours, si pas déjà envoyé un winback dans le mois courant.
 *      Génère un PromoCode dynamique (REVIENS<6chars>) valide 30 jours,
 *      single-use par user, 10 % off.
 *
 * Auth : Bearer ${CRON_SECRET}, même secret que les autres crons.
 *
 * Limits : 100 follow-ups + 100 winbacks par run (suffit pour < 1k
 * commandes/jour). Pas atomique — si un email fail au milieu, le
 * suivant est tenté quand même.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { sendReengagementFollowUpEmail, sendReengagementWinbackEmail } from '@/lib/emails/send';
import { reviewSubmitToken } from '@/lib/reviews/token';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_FOLLOWUP = 100;
const BATCH_WINBACK = 100;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

/** Constants — ajustable via env si besoin. */
const FOLLOWUP_DELAY_DAYS = 7;
const WINBACK_THRESHOLD_DAYS = 90;
const WINBACK_DISCOUNT_PCT = 10;
const WINBACK_VALIDITY_DAYS = 30;

interface RunSummary {
  followUp: { eligible: number; sent: number; skipped: number; failed: number };
  winback: { eligible: number; sent: number; skipped: number; failed: number };
  durationMs: number;
}

export async function GET(req: NextRequest) {
  // ─── Auth ──────────────────────────────────────────────────────────────
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      log.error('cron/re-engagement: CRON_SECRET not set in production');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    log.warn('cron/re-engagement: CRON_SECRET not set — allowing in non-prod');
  } else {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();
  const summary: RunSummary = {
    followUp: { eligible: 0, sent: 0, skipped: 0, failed: 0 },
    winback: { eligible: 0, sent: 0, skipped: 0, failed: 0 },
    durationMs: 0,
  };

  try {
  // ─── 1. Post-delivery follow-up ────────────────────────────────────────
  // Range : entre 7.5 et 6.5 jours ago (vise les orders DELIVERED qui ont
  // ~7d). On utilise updatedAt comme proxy pour "passage en DELIVERED" —
  // le webhook Sinalite mark updatedAt à ce moment.
  const followUpStart = new Date(Date.now() - (FOLLOWUP_DELAY_DAYS + 0.5) * 24 * 3600 * 1000);
  const followUpEnd = new Date(Date.now() - (FOLLOWUP_DELAY_DAYS - 0.5) * 24 * 3600 * 1000);

  const followUpCandidates = await prisma.order.findMany({
    where: {
      status: 'DELIVERED',
      updatedAt: { gte: followUpStart, lte: followUpEnd },
    },
    include: { user: true },
    take: BATCH_FOLLOWUP,
  });
  summary.followUp.eligible = followUpCandidates.length;

  for (const order of followUpCandidates) {
    const label = `reengagement-follow-up:${order.id}`;
    // Dedup : EmailDelivery existant avec ce label = déjà envoyé.
    const existing = await prisma.emailDelivery.findFirst({
      where: { label },
      select: { id: true },
    });
    if (existing) {
      summary.followUp.skipped++;
      continue;
    }
    try {
      const token = reviewSubmitToken(order.id);
      const reviewUrl = `${APP_URL}/reviews/submit?orderId=${order.id}&token=${token}`;
      const result = await sendReengagementFollowUpEmail({
        order, user: order.user, reviewUrl,
      });
      if (result.sent) summary.followUp.sent++;
      else summary.followUp.skipped++;
    } catch (err) {
      log.error({ err, orderId: order.id }, 'reengagement follow-up send failed');
      summary.followUp.failed++;
    }
  }

  // ─── 2. Win-back ───────────────────────────────────────────────────────
  // Users dont la dernière commande PAID/DELIVERED/etc a > 90 jours.
  // Pour scaler : on prend les users actifs (au moins 1 commande passée)
  // et on check leur lastOrderAt.
  const winbackCutoff = new Date(Date.now() - WINBACK_THRESHOLD_DAYS * 24 * 3600 * 1000);
  const now = new Date();
  const labelMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  // Lookup : users avec leur lastOrder via groupBy. having + orderBy
  // requis ensemble par Prisma quand on utilise take.
  const lastOrders = await prisma.order.groupBy({
    by: ['userId'],
    where: { status: { notIn: ['PENDING', 'FAILED', 'CANCELLED'] } },
    _max: { createdAt: true },
    having: { createdAt: { _max: { lte: winbackCutoff } } },
    orderBy: { _max: { createdAt: 'asc' } },
    take: BATCH_WINBACK,
  });
  summary.winback.eligible = lastOrders.length;

  for (const lo of lastOrders) {
    const userId = lo.userId;
    const lastOrderAt = lo._max?.createdAt;
    if (!lastOrderAt) continue;
    const daysSinceLast = Math.floor((Date.now() - lastOrderAt.getTime()) / (24 * 3600 * 1000));

    // Dedup : 1 winback par user par mois calendaire
    const label = `reengagement-winback:${userId}:${labelMonth}`;
    const existing = await prisma.emailDelivery.findFirst({
      where: { label },
      select: { id: true },
    });
    if (existing) {
      summary.winback.skipped++;
      continue;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      summary.winback.skipped++;
      continue;
    }

    // Génère un code promo unique pour ce user, valable 30j, 1 use max,
    // 10 % off. Format REVIENS<6 chars random>.
    const codeSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `REVIENS${codeSuffix}`;
    try {
      await prisma.promoCode.create({
        data: {
          code,
          label: `Win-back ${labelMonth} pour ${user.email}`,
          discountPct: WINBACK_DISCOUNT_PCT,
          active: true,
          expiresAt: new Date(Date.now() + WINBACK_VALIDITY_DAYS * 24 * 3600 * 1000),
          maxUses: 1,
        },
      });
    } catch (err) {
      // Race ou collision unique — skip ce user, on retentera demain
      log.error({ err, userId, code }, 'winback promo create failed');
      summary.winback.failed++;
      continue;
    }

    try {
      const result = await sendReengagementWinbackEmail({
        user,
        promoCode: code,
        discountLabel: `${WINBACK_DISCOUNT_PCT} % de remise`,
        daysSinceLast,
      });
      if (result.sent) summary.winback.sent++;
      else summary.winback.skipped++;
    } catch (err) {
      log.error({ err, userId }, 'winback send failed');
      summary.winback.failed++;
    }
  }

    summary.durationMs = Date.now() - start;
    log.info({ summary }, 'cron/re-engagement done');
    void pingCronHealthcheck('re-engagement', 'success', {
      followUpSent: summary.followUp.sent,
      winbackSent: summary.winback.sent,
    });
    void recordCronRun({
      name: 're-engagement',
      status: 'success',
      latencyMs: Date.now() - start,
      data: {
        followUpSent: summary.followUp.sent,
        followUpFailed: summary.followUp.failed,
        winbackSent: summary.winback.sent,
        winbackFailed: summary.winback.failed,
      },
    });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    // Round 14 #4 — was missing : sans outer catch, un throw dans la
    // query initiale skip recordCronRun('fail') + healthcheck.
    log.error({ err }, 'cron/re-engagement failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('re-engagement', 'fail', { error: errMsg });
    void recordCronRun({
      name: 're-engagement',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
      data: { summary },
    });
    return NextResponse.json(
      { ok: false, error: errMsg, latencyMs: Date.now() - start, summary },
      { status: 500 },
    );
  }
}
