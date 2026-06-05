/**
 * GET /api/cron/sinalite-latency
 *
 * Round 28 #3. Probe latency Sinalite product endpoint toutes les 15 min.
 * Track la latence dans CronRun.data. /admin/crons peut afficher P50/P95
 * trend pour détecter dégradation graduelle (différent du /api/health
 * qui ne fait qu'un OK/fail instantané).
 *
 * Alert Slack si P95 sur les 4 derniers runs (= dernière heure) > 3s,
 * sans alerter pour un single spike.
 *
 * Auth : Bearer CRON_SECRET. Run via GH Actions.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { sendCriticalAlert } from '@/lib/alerting/slack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const P95_ALERT_MS = 3000;
const RECENT_RUNS_FOR_TREND = 4; // ~1h avec cron toutes les 15 min
const PROBE_TIMEOUT_MS = 8000;

/**
 * Probe le endpoint produit Sinalite. Retourne latency en ms.
 * Inline (pas dans le helper getSinaliteToken de health) pour mesurer
 * le full round-trip incluant auth.
 */
async function probeSinaliteLatency(): Promise<{ latencyMs: number; status: number }> {
  const start = Date.now();

  // 1. Auth
  const authRes = await fetch(`${process.env.SINALITE_AUTH_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SINALITE_CLIENT_ID,
      client_secret: process.env.SINALITE_CLIENT_SECRET,
      audience: process.env.SINALITE_AUDIENCE,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!authRes.ok) throw new Error(`Sinalite auth HTTP ${authRes.status}`);
  const { access_token } = await authRes.json() as { access_token: string };

  // 2. Product call (cheap GET, mesure le real path)
  const prodRes = await fetch(`${process.env.SINALITE_API_BASE}/product/1`, {
    headers: { Authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });

  return { latencyMs: Date.now() - start, status: prodRes.status };
}

/** Quantile sur un array de numbers (nearest-rank, RFC 2330 style). */
function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1);
  return sorted[Math.max(0, idx)];
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'sinalite-latency');
  if (denied) return denied;

  if (!process.env.SINALITE_CLIENT_ID || !process.env.SINALITE_API_BASE) {
    log.warn('cron/sinalite-latency: Sinalite env not configured, skipping');
    return NextResponse.json({ ok: true, skipped: 'sinalite_not_configured' });
  }

  const start = Date.now();

  try {
    const { latencyMs, status } = await probeSinaliteLatency();
    const probeOk = status >= 200 && status < 500;

    // Fetch recent runs pour calculer P95 sur la fenêtre
    const recentRuns = await prisma.cronRun.findMany({
      where: { name: 'sinalite-latency', status: 'success' },
      orderBy: { createdAt: 'desc' },
      take: RECENT_RUNS_FOR_TREND - 1,
      select: { latencyMs: true },
    });

    // Inclure le run courant + précédents (déjà persistés)
    const sample = [latencyMs, ...recentRuns.map((r) => r.latencyMs)].sort((a, b) => a - b);
    const p50 = quantile(sample, 0.5);
    const p95 = quantile(sample, 0.95);

    let alerted = false;
    // Alerte uniquement si on a une fenêtre pleine (4 runs) ET P95 > seuil.
    // Évite faux-positifs sur les premiers runs après deploy.
    if (sample.length >= RECENT_RUNS_FOR_TREND && p95 !== null && p95 > P95_ALERT_MS) {
      await sendCriticalAlert({
        severity: 'warning',
        title: `Sinalite P95 latency ${p95} ms (> ${P95_ALERT_MS} ms)`,
        body:
          `Sur les ${RECENT_RUNS_FOR_TREND} derniers runs (~1 h) :\n` +
          `  P50 = ${p50} ms\n  P95 = ${p95} ms\n` +
          `Si ça persiste, le checkout va commencer à timeout côté customer ` +
          `(production submit prend > 8s — proche du seuil 10s du wizard).`,
        context: { p50, p95, sampleSize: sample.length, currentRun: latencyMs, probeHttpStatus: status },
      });
      alerted = true;
    }

    const result = {
      ok: true,
      latencyMs: latencyMs,
      probeHttpStatus: status,
      probeOk,
      p50,
      p95,
      sampleSize: sample.length,
      alerted,
    };
    log.info(result, 'cron/sinalite-latency ran');
    await pingCronHealthcheck('sinalite-latency', 'success', { latencyMs, p95 });
    await recordCronRun({
      name: 'sinalite-latency',
      status: 'success',
      latencyMs,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/sinalite-latency probe failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    await pingCronHealthcheck('sinalite-latency', 'fail', { error: errMsg });
    await recordCronRun({
      name: 'sinalite-latency',
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
