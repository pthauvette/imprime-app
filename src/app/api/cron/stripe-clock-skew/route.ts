/**
 * GET /api/cron/stripe-clock-skew
 *
 * Round 27 #4. Monitoring proactif du clock drift entre notre serveur
 * et l'horloge Stripe. Si > 120 secondes, alerte Slack — sinon les
 * webhooks vont commencer à être rejetés (tolerance window 300s,
 * mais on alerte tôt pour debugging avant la panne).
 *
 * Pourquoi ce monitor :
 *   Stripe signe ses webhooks avec un timestamp. constructEvent() throw
 *   "Timestamp outside the tolerance zone" si l'écart > 300s. C'est
 *   silencieux côté Stripe (ils marquent juste le webhook comme failed)
 *   et silencieux côté nous (404 retourné). L'admin découvre 3h plus
 *   tard quand le dead-letter alert (Round 25 #2) déclenche.
 *
 *   Ce cron tape /v1/balance toutes les 6h, lit le response header Date
 *   (RFC 7231 spec : doit refléter le clock serveur Stripe), compare à
 *   notre Date.now(). > 120s → Slack alert "fix NTP avant que les
 *   webhooks soient rejetés".
 *
 * Auth : Bearer CRON_SECRET.
 */

import { NextResponse, type NextRequest } from 'next/server';
// On utilise fetch raw (vs Stripe SDK) pour accéder au response Date header,
// que le SDK n'expose pas. Le call est juste un GET /v1/balance, pas besoin
// du SDK.
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { sendCriticalAlert } from '@/lib/alerting/slack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const DRIFT_WARN_MS = 120 * 1000; // 2 min — alerter avant les 5min de tolerance
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

export async function GET(req: NextRequest) {
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      log.error('cron/stripe-clock-skew: CRON_SECRET not set in production');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    log.warn('cron/stripe-clock-skew: CRON_SECRET not set — allowing in non-prod');
  } else {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    log.warn('cron/stripe-clock-skew: STRIPE_SECRET_KEY not set, skipping');
    return NextResponse.json({ ok: true, skipped: 'stripe_not_configured' });
  }

  try {
    // Ping /v1/balance — call cheap, doesn't change anything. On capture
    // le clock Stripe via response Date header.
    const beforeMs = Date.now();
    const res = await fetch(`${STRIPE_API_BASE}/balance`, {
      headers: { Authorization: `Bearer ${stripeSecret}` },
      signal: AbortSignal.timeout(5000),
    });
    const afterMs = Date.now();
    const localMidMs = Math.round((beforeMs + afterMs) / 2);

    if (!res.ok) {
      throw new Error(`Stripe API HTTP ${res.status}`);
    }

    const dateHeader = res.headers.get('date');
    if (!dateHeader) {
      throw new Error('Stripe response missing Date header');
    }

    const stripeMs = new Date(dateHeader).getTime();
    if (!Number.isFinite(stripeMs)) {
      throw new Error(`Stripe Date header unparseable: ${dateHeader}`);
    }

    const driftMs = Math.abs(localMidMs - stripeMs);
    const driftSec = Math.round(driftMs / 1000);

    let alerted = false;
    if (driftMs > DRIFT_WARN_MS) {
      await sendCriticalAlert({
        severity: 'critical',
        title: `Clock skew Stripe ↔ Plio : ${driftSec}s`,
        body:
          `L'horloge serveur Plio dérive de ${driftSec}s par rapport à Stripe. ` +
          `Tolerance webhooks = 300s — si la dérive monte, les webhooks ` +
          `payment_intent.* seront rejetés silencieusement. ` +
          `À fixer : vérifier NTP sur le serveur (timedatectl status).`,
        context: { driftMs, driftSec, threshold: DRIFT_WARN_MS / 1000, stripeMs, localMs: localMidMs },
      });
      alerted = true;
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      driftMs,
      driftSec,
      threshold: DRIFT_WARN_MS / 1000,
      alerted,
    };
    log.info(result, 'cron/stripe-clock-skew ran');
    void pingCronHealthcheck('stripe-clock-skew', 'success', { driftSec, alerted });
    void recordCronRun({
      name: 'stripe-clock-skew',
      status: 'success',
      latencyMs: Date.now() - start,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/stripe-clock-skew failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('stripe-clock-skew', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'stripe-clock-skew',
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
