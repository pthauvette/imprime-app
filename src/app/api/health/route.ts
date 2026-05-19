/**
 * GET /api/health — health check endpoint pour UptimeRobot / monitoring.
 *
 * Stratégie : un endpoint léger qui touche les dépendances critiques en
 * parallèle avec timeouts courts. Retourne 200 si tout est vert, 503 si
 * une dépendance CRITIQUE fail.
 *
 * Catégories :
 *   - CRITIQUE (503 si fail) : db:postgres (pas de site sans DB)
 *   - DEGRADED (200 + warn)  : api:sinalite, api:stripe, email:queue, webhooks:recent
 *
 * Format IETF Health Check (draft-inadarei-api-health-check) :
 *   { status: 'pass'|'warn'|'fail', version, releaseId, checks: {...} }
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TIMEOUT_MS = 3000;
const SHA = process.env.AWS_COMMIT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';
const VERSION = process.env.npm_package_version ?? '0.0.0';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
  : null;

interface CheckResult {
  status: 'pass' | 'fail';
  latencyMs: number;
  error?: string;
  /** Optional details for diagnostics (count, threshold breach, etc.). */
  detail?: Record<string, unknown>;
}

async function timed<T>(
  fn: () => Promise<T>,
  detailFn?: (result: T) => Record<string, unknown>,
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
      ),
    ]);
    return {
      status: 'pass',
      latencyMs: Date.now() - start,
      ...(detailFn ? { detail: detailFn(result) } : {}),
    };
  } catch (err) {
    return {
      status: 'fail',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}

export async function GET() {
  const start = Date.now();
  const now = Date.now();

  // Run checks in parallel
  const [db, sinalite, stripeCheck, emailQueue, webhookRecent] = await Promise.all([
    // Critical : DB ping
    timed(() => prisma.$queryRaw`SELECT 1`),
    // Degraded : Sinalite API auth + product fetch
    timed(async () => {
      const res = await fetch(`${process.env.SINALITE_API_BASE}/product/1`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Authorization': `Bearer ${await getSinaliteToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
    // Degraded : Stripe API auth — Round 14 #4 fix : on ne retourne PLUS
    // la balance dans le detail (endpoint /api/health est public + wildcard
    // CORS dropped, mais defense en profondeur). On vérifie juste que
    // l'API répond — pas besoin d'exposer le montant à qui poll ça.
    stripe
      ? timed(
          async () => {
            await stripe.balance.retrieve({}, { timeout: TIMEOUT_MS });
            return { ok: true };
          },
          () => ({ reachable: true }),
        )
      : Promise.resolve<CheckResult>({ status: 'fail', latencyMs: 0, error: 'STRIPE_SECRET_KEY not set' }),
    // Degraded : email queue dead-letter count (alert si > 10 dans la dernière heure)
    timed(
      async () => {
        const oneHourAgo = new Date(now - 60 * 60 * 1000);
        const failedCount = await prisma.emailDelivery.count({
          where: { status: 'DEAD', updatedAt: { gte: oneHourAgo } },
        });
        if (failedCount > 10) throw new Error(`${failedCount} dead emails in last hour`);
        return failedCount;
      },
      (failed) => ({ deadInLastHour: failed }),
    ),
    // Degraded : webhook failure rate (alert si > 5 failures dans les 15 derniers min)
    timed(
      async () => {
        const fifteenMinAgo = new Date(now - 15 * 60 * 1000);
        const failures = await prisma.webhookEvent.count({
          where: { success: false, processedAt: { gte: fifteenMinAgo } },
        });
        if (failures > 5) throw new Error(`${failures} webhook failures in last 15min`);
        return failures;
      },
      (failures) => ({ failedLast15min: failures }),
    ),
  ]);

  const checks = {
    'db:postgres': db,
    'api:sinalite': sinalite,
    'api:stripe': stripeCheck,
    'email:queue': emailQueue,
    'webhooks:recent': webhookRecent,
  };

  const isCritical = (name: string) => name === 'db:postgres';
  const overallStatus: 'pass' | 'warn' | 'fail' =
    Object.entries(checks).some(([n, c]) => c.status === 'fail' && isCritical(n))
      ? 'fail'
      : Object.values(checks).some((c) => c.status === 'fail')
        ? 'warn'
        : 'pass';

  const httpStatus = overallStatus === 'fail' ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      version: VERSION,
      releaseId: SHA.slice(0, 7),
      timestamp: new Date().toISOString(),
      totalLatencyMs: Date.now() - start,
      checks,
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        // Round 14 #4 fix : wildcard CORS dropped. /api/health est consommé
        // par Healthchecks.io (server-side curl, pas de CORS) + monitoring
        // dashboards intern. Aucune raison de l'exposer cross-origin. Si
        // un service externe doit poll, ajoute son origin spécifique.
      },
    },
  );
}

async function getSinaliteToken(): Promise<string> {
  const res = await fetch(`${process.env.SINALITE_AUTH_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SINALITE_CLIENT_ID,
      client_secret: process.env.SINALITE_CLIENT_SECRET,
      audience: process.env.SINALITE_AUDIENCE,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error('Sinalite auth failed');
  const data = await res.json() as { access_token: string };
  return data.access_token;
}
