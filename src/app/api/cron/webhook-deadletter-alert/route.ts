/**
 * GET /api/cron/webhook-deadletter-alert
 *
 * Round 25 #2. Compte les WebhookEvent en état "dead-letter" : failed
 * (success=false), stales (processedAt < now - 24h), et jamais replayed
 * (replayCount = 0).
 *
 * Si > threshold (5 par défaut), pingue Slack pour qu'un humain regarde.
 * Sans cette alerte, des failures persistantes s'accumulent silencieusement
 * et un Stripe webhook critique peut rester non-replayed pendant des jours.
 *
 * Schedule : toutes les 2h via GH Actions. Frequent enough pour catcher
 * un nouveau pile-up vite, rare enough pour pas spammer Slack (le cron
 * fait du throttling additionnel : skip alert si on en a déjà envoyée < 6h).
 *
 * Auth : Bearer CRON_SECRET.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { sendCriticalAlert } from '@/lib/alerting/slack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

/** Threshold count avant Slack alert. Tunable via env. */
const DEAD_LETTER_THRESHOLD = Number(process.env.WEBHOOK_DEAD_LETTER_THRESHOLD ?? '5');
/** Throttle : ne pas re-alerter si un alert a déjà été envoyée < N ms. */
const ALERT_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6h
/** Combien de temps après une failure on considère "stale" (pas un transient). */
const STALENESS_MS = 24 * 60 * 60 * 1000; // 24h

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      log.error('cron/webhook-deadletter-alert: CRON_SECRET not set in production');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    log.warn('cron/webhook-deadletter-alert: CRON_SECRET not set — allowing in non-prod');
  } else {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();
  const staleCutoff = new Date(Date.now() - STALENESS_MS);

  try {
    // Count des dead-letters : failed, stales, jamais replayed.
    // On groupBy source pour donner du contexte dans l'alerte.
    const groups = await prisma.webhookEvent.groupBy({
      by: ['source'],
      where: {
        success: false,
        processedAt: { lt: staleCutoff },
        replayCount: 0,
      },
      _count: { _all: true },
    });

    const total = groups.reduce((acc, g) => acc + g._count._all, 0);
    const bySource = Object.fromEntries(groups.map((g) => [g.source, g._count._all]));

    let alerted = false;
    let throttled = false;

    if (total >= DEAD_LETTER_THRESHOLD) {
      // Throttle : check le dernier run du même cron, skip si < 6h ET alerted=true.
      const recent = await prisma.cronRun.findFirst({
        where: { name: 'webhook-deadletter-alert' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, data: true },
      }).catch(() => null);

      let recentlyAlerted = false;
      if (recent && Date.now() - recent.createdAt.getTime() < ALERT_THROTTLE_MS) {
        try {
          const parsed = JSON.parse(recent.data ?? '{}') as { alerted?: boolean };
          recentlyAlerted = !!parsed.alerted;
        } catch {
          recentlyAlerted = false;
        }
      }

      if (recentlyAlerted) {
        throttled = true;
        log.info({ total, bySource }, 'webhook-deadletter-alert: skipping (throttled, alerted recently)');
      } else {
        await sendCriticalAlert({
          severity: 'warning',
          title: `${total} webhook(s) en dead-letter depuis > 24h`,
          body:
            `Threshold ${DEAD_LETTER_THRESHOLD} dépassé. Ces webhooks ont failed et n'ont jamais été replayed. ` +
            `Vérifier /admin/webhooks pour identifier la cause + bulk-replay.`,
          context: { total, bySource, threshold: DEAD_LETTER_THRESHOLD, stalenessHours: 24 },
          actionUrl: `${APP_URL}/admin/webhooks?status=failed`,
          actionLabel: 'Ouvrir /admin/webhooks',
        });
        alerted = true;
      }
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      total,
      bySource,
      threshold: DEAD_LETTER_THRESHOLD,
      alerted,
      throttled,
    };
    log.info(result, 'cron/webhook-deadletter-alert ran');
    void pingCronHealthcheck('webhook-deadletter-alert', 'success', { total, alerted });
    void recordCronRun({
      name: 'webhook-deadletter-alert',
      status: 'success',
      latencyMs: Date.now() - start,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/webhook-deadletter-alert failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('webhook-deadletter-alert', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'webhook-deadletter-alert',
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
