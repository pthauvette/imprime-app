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
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { sendReengagementFollowUpEmail, sendReengagementWinbackEmail } from '@/lib/emails/send';
import { reviewSubmitToken } from '@/lib/reviews/token';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const denied = requireCronAuth(req, 're-engagement');
  if (denied) return denied;

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

  // finding [106] — avant, cette relance ignorait qu'un avis avait déjà été
  // laissé (via le premier email post-livraison, ou en self-serve) : le
  // texte de l'email dit pourtant « on ne re-demande pas ». Un seul query
  // groupé (pas de N+1) pour savoir quels orders de ce batch ont déjà un
  // Review — Review.orderId est @unique, donc « a une review » = un id.
  const alreadyReviewed = new Set(
    (
      await prisma.review.findMany({
        where: { orderId: { in: followUpCandidates.map((o) => o.id) } },
        select: { orderId: true },
      })
    ).map((r) => r.orderId),
  );

  for (const order of followUpCandidates) {
    if (alreadyReviewed.has(order.id)) {
      summary.followUp.skipped++;
      continue;
    }
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

    // Audit v2 #7.2 — on génère la VALEUR du code puis on ENVOIE d'abord (le
    // helper vérifie l'opt-out emailReengagement + suppression/throttle) ; on ne
    // PERSISTE le PromoCode qu'APRÈS un envoi confirmé. Avant : le code était
    // créé AVANT l'envoi → pour un opt-out (le send early-return sans créer
    // d'EmailDelivery), un code promo ACTIF orphelin était créé, et comme aucun
    // EmailDelivery n'existait, la dédup label ne matchait jamais → recréation
    // QUOTIDIENNE (bloat de codes valides jamais livrés).
    const codeSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `REVIENS${codeSuffix}`;

    let result: Awaited<ReturnType<typeof sendReengagementWinbackEmail>>;
    try {
      result = await sendReengagementWinbackEmail({
        user,
        promoCode: code,
        discountLabel: `${WINBACK_DISCOUNT_PCT} % de remise`,
        daysSinceLast,
      });
    } catch (err) {
      log.error({ err, userId }, 'winback send failed');
      summary.winback.failed++;
      continue;
    }

    if (!result.sent) {
      // opt-out / suppressed / throttled → aucun code créé (plus d'orphelin).
      summary.winback.skipped++;
      continue;
    }

    // Email parti → on matérialise le code promo (référencé dans l'email).
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
      summary.winback.sent++;
    } catch (err) {
      // Rare : l'email est parti mais le code n'a pas pu être créé (collision
      // unique / blip DB) → le client a un code qui ne validera pas. On alerte.
      log.error({ err, userId, code }, 'winback promo create failed AFTER send — customer has unusable code');
      summary.winback.failed++;
    }
  }

    summary.durationMs = Date.now() - start;
    log.info({ summary }, 'cron/re-engagement done');
    await pingCronHealthcheck('re-engagement', 'success', {
      followUpSent: summary.followUp.sent,
      winbackSent: summary.winback.sent,
    });
    await recordCronRun({
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
    await pingCronHealthcheck('re-engagement', 'fail', { error: errMsg });
    await recordCronRun({
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
