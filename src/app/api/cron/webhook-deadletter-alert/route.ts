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
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import { countDeadLetterWebhooks } from '@/lib/webhooks/dead-letter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

/** Threshold count avant Slack alert. Tunable via env. */
const DEAD_LETTER_THRESHOLD = Number(process.env.WEBHOOK_DEAD_LETTER_THRESHOLD ?? '5');
/** Throttle : ne pas re-alerter si un alert a déjà été envoyée < N ms. */
const ALERT_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6h
// Round 26 #4 — STALENESS_MS (24h) maintenant dans lib/webhooks/dead-letter.ts
// (shared avec /api/health). Le cron consomme le count agrégé directement.

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'webhook-deadletter-alert');
  if (denied) return denied;

  const start = Date.now();

  try {
    // Round 26 #4 — extrait dans lib/webhooks/dead-letter pour DRY avec
    // /api/health qui expose la même metric aux monitoring tools.
    const { total, bySource } = await countDeadLetterWebhooks();

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
    await pingCronHealthcheck('webhook-deadletter-alert', 'success', { total, alerted });
    await recordCronRun({
      name: 'webhook-deadletter-alert',
      status: 'success',
      latencyMs: Date.now() - start,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/webhook-deadletter-alert failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    await pingCronHealthcheck('webhook-deadletter-alert', 'fail', { error: errMsg });
    await recordCronRun({
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
