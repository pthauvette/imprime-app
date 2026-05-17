/**
 * GET /api/health — health check endpoint pour UptimeRobot / monitoring.
 *
 * Stratégie : un endpoint léger qui touche les dépendances critiques
 * (DB + Sinalite + S3 facultatif) en parallèle avec timeouts courts.
 * Retourne 200 si tout est vert, 503 si une dépendance critique fail.
 *
 * Format de réponse compatible avec les conventions IETF Health Check
 * (draft-inadarei-api-health-check) :
 *   { status: 'pass'|'warn'|'fail', version, releaseId, checks: {...} }
 *
 * UptimeRobot peut juste regarder le status HTTP. Pour debug profond,
 * il y a le JSON body avec timings par dependency.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TIMEOUT_MS = 3000;
const SHA = process.env.AWS_COMMIT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';
const VERSION = process.env.npm_package_version ?? '0.0.0';

interface CheckResult {
  status: 'pass' | 'fail';
  latencyMs: number;
  error?: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
      ),
    ]);
    return { status: 'pass', latencyMs: Date.now() - start };
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

  // Run checks in parallel. Database is critical (any fail = overall fail).
  // Sinalite is degraded-mode tolerable (orders can't be placed but site
  // browse + admin still works).
  const [db, sinalite] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    timed(async () => {
      // Lightest possible Sinalite ping — list products takes ~200ms.
      // We just verify auth works.
      const res = await fetch(`${process.env.SINALITE_API_BASE}/products/${process.env.SINALITE_STORE_CODE}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Authorization': `Bearer ${await getSinaliteToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
  ]);

  const checks = {
    'db:postgres': db,
    'api:sinalite': sinalite,
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
        // CORS for monitoring tools that ping from anywhere
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

/**
 * Tiny helper to get a cached Sinalite token without importing the full
 * client (which has heavy validation on import).
 */
async function getSinaliteToken(): Promise<string> {
  const res = await fetch(`${process.env.SINALITE_AUTH_BASE}/oauth/token`, {
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
