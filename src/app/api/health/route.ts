/**
 * GET /api/health — health check endpoint pour UptimeRobot / monitoring.
 *
 * Stratégie : un endpoint léger qui touche les dépendances critiques en
 * parallèle avec timeouts courts. Retourne 200 si tout est vert, 503 si
 * une dépendance CRITIQUE fail.
 *
 * Catégories :
 *   - CRITIQUE (503 si fail) : db:postgres (pas de site sans DB)
 *   - DEGRADED (200 + warn)  : api:sinalite, api:stripe, email:queue, webhooks:recent,
 *     config:env (variables d'environnement absentes du runtime — cf. panne 2026-07-20)
 *
 * Format IETF Health Check (draft-inadarei-api-health-check) :
 *   { status: 'pass'|'warn'|'fail', version, releaseId, checks: {...} }
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { countDeadLetterWebhooks } from '@/lib/webhooks/dead-letter';
import { inspectEnvConfig } from '@/lib/config/env-health';
import { log } from '@/lib/logger';

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
  const [db, sinalite, stripeCheck, emailQueue, webhookRecent, webhookDeadLetter] = await Promise.all([
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
      // Le message ne NOMME pas la variable : /api/health est public, et le
      // détail de quelle clé manque appartient aux logs, pas à la réponse.
      // (Fuite préexistante, détectée par tests/env-health.test.ts.)
      : Promise.resolve<CheckResult>({ status: 'fail', latencyMs: 0, error: 'stripe non configuré' }),
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
    // Round 26 #4 — Degraded : webhook dead-letter pile-up (chronic).
    // Distinct du `webhooks:recent` qui catch les transients (15min).
    // Threshold aligné avec le cron alerter (Round 25 #2) : > 5 dead-letters.
    timed(
      async () => {
        const { total, bySource } = await countDeadLetterWebhooks();
        if (total > 5) throw new Error(`${total} webhook dead-letters > 24h not replayed`);
        return { total, bySource };
      },
      (r) => ({ total: r.total, bySource: r.bySource }),
    ),
  ]);

  // config:env — SYNCHRONE (lecture de process.env), donc hors du Promise.all.
  // Rend visible le mode d'échec qui a coûté des heures le 2026-07-20 : une
  // variable posée dans la console Amplify mais jamais arrivée au runtime, sans
  // la moindre erreur. Classé DEGRADED et non critique : une clé manquante ne
  // veut pas dire que le site est mort, et faire chuter l'uptime SLA sur ce
  // signal le rendrait vite ignoré.
  const envReport = inspectEnvConfig();
  const envCheck: CheckResult = {
    // `config:env` n'est pas un check CRITIQUE : son `fail` devient un `warn`
    // global en HTTP 200, jamais un 503. C'est précisément « alerter sans
    // refuser le démarrage » (décision Patrick, 2026-08-10) — le site
    // fonctionne, sert des prix et encaisse ; c'est la FABRICATION qui
    // n'a pas lieu, et ça doit se voir sans faire chuter l'uptime.
    status: envReport.failing || envReport.sinaliteSandboxEnProd ? 'fail' : 'pass',
    latencyMs: 0,
    ...(envReport.failing
      ? { error: `${envReport.missingRequired.length} variable(s) requise(s) absente(s) du runtime` }
      : envReport.sinaliteSandboxEnProd
        ? { error: 'SINALITE_API_BASE pointe sur le sandbox en production' }
        : {}),
    // ⚠️ Endpoint PUBLIC : des COMPTES, jamais les noms. Publier « ENFORCE_SHIPPING_SIG
    // est inactif » renseignerait un attaquant sur les gardes qu'il peut ignorer.
    detail: {
      missingRequired: envReport.missingRequired.length,
      guardsInactive: envReport.guardsInactive.length,
      smsIncomplet: envReport.smsIncomplet.length,
      // Booléen et non l'URL — endpoint public. Il ne dit pas OÙ l'on pointe,
      // seulement que la cible est le bac à sable.
      sinaliteSandbox: envReport.sinaliteSandboxEnProd,
    },
  };
  // Les NOMS partent aux logs (privés) — c'est là que l'opérateur diagnostique.
  if (envReport.missingRequired.length || envReport.guardsInactive.length) {
    log.warn(
      { missingRequired: envReport.missingRequired, guardsInactive: envReport.guardsInactive },
      'config:env — variables absentes du runtime (posées en console mais non transmises ?)',
    );
  }
  // Journal SÉPARÉ, en `error` : ce n'est pas « un garde-fou est inactif »
  // (état voulu) mais « l'activation a été DEMANDÉE et échoue silencieusement ».
  // Noyé dans le warn ci-dessus, ce cas passerait pour un rollout délibéré.
  if (envReport.smsIncomplet.length) {
    log.error(
      { manquantes: envReport.smsIncomplet },
      'config:env — SMS_AUTH=ON mais configuration Twilio INCOMPLÈTE : la connexion par texto reste éteinte',
    );
  }

  // Journal SÉPARÉ et en `error` : ni « variable absente » ni « garde inactif »,
  // mais « tout a l'air de marcher et rien ne se fabrique ». C'est le mode
  // d'échec le plus coûteux du lot — un client paie, reçoit sa confirmation, et
  // aucune presse ne tourne.
  if (envReport.sinaliteSandboxEnProd) {
    log.error(
      { variable: 'SINALITE_API_BASE' },
      'config:env — SINALITE_API_BASE pointe sur le SANDBOX en production : les commandes payées ne partiront JAMAIS en fabrication. Poser https://liveapi.sinalite.com',
    );
  }

  const checks = {
    'db:postgres': db,
    'config:env': envCheck,
    'api:sinalite': sinalite,
    'api:stripe': stripeCheck,
    'email:queue': emailQueue,
    'webhooks:recent': webhookRecent,
    'webhooks:deadletter': webhookDeadLetter,
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
