/**
 * GET /api/cron/email-retry
 *
 * Cron qui retry les EmailDelivery en status FAILED dont nextAttemptAt
 * est passé. Schedule via GH Actions toutes les 5 min.
 *
 * Auth : Bearer ${CRON_SECRET}, même secret que /api/cron/cleanup et
 * /api/cron/daily-summary.
 *
 * Pour chaque email :
 *   - call processDelivery(id) qui re-tente sendEmail
 *   - Sur succès → status SENT, sentAt = now
 *   - Sur échec → status FAILED + nextAttemptAt selon backoff
 *   - Si attempts >= maxAttempts → status DEAD + Slack alert
 *
 * Limit 50 emails par run pour pas saturer SES (60 req/sec limit dans
 * SES sandbox default, 14/sec en prod typical). Si plus que 50 backlog,
 * les vieux passent en premier (orderBy createdAt asc).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getEmailsReadyForRetry, processDelivery } from '@/lib/emails/queue';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 50;

export async function GET(req: NextRequest) {
  // Auth
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      log.error('cron/email-retry: CRON_SECRET not set in production');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    log.warn('cron/email-retry: CRON_SECRET not set — allowing in non-prod');
  } else {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();

  // Fetch emails prêtes pour retry
  const ready = await getEmailsReadyForRetry(BATCH_SIZE);

  if (ready.length === 0) {
    void pingCronHealthcheck('email-retry', 'success', { processed: 0 });
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - start,
      processed: 0,
      hint: 'Pas d\'emails FAILED prêtes pour retry',
    });
  }

  // Process en parallèle (max 50, OK pour SES). Si on devait gérer 100+
  // on chunkerait en lots de 10 avec Promise.allSettled.
  const results = await Promise.all(
    ready.map(({ id }) => processDelivery(id)),
  );

  const sent = results.filter((r) => r.sent).length;
  const stillFailed = results.length - sent;

  const result = {
    ok: true,
    latencyMs: Date.now() - start,
    processed: results.length,
    sent,
    stillFailed,
  };

  log.info(result, 'cron/email-retry ran');
  void pingCronHealthcheck('email-retry', 'success', { sent, stillFailed });
  return NextResponse.json(result);
}
