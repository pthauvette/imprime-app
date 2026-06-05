/**
 * Helper pour pinger un service de cron monitoring externe (Healthchecks.io,
 * Cronitor, etc.) à la fin de chaque cron job.
 *
 * Use case : si un cron ne run pas (GH Actions outage, code bug qui throw
 * en début, etc.), Healthchecks.io détecte le timeout et alerte. Sans ça,
 * un cron mort peut passer inaperçu plusieurs jours.
 *
 * Setup :
 *   1. Créer un check par cron sur healthchecks.io (un UUID par check).
 *   2. Set ENV CRON_HEALTHCHECK_URLS = "daily-summary:https://hc-ping.com/uuid1,re-engagement:https://hc-ping.com/uuid2,..."
 *   3. Les routes /api/cron/* appellent pingCronHealthcheck(name, 'success' | 'fail')
 *
 * Best-effort : si la config manque OU si le HTTP fail, on log mais on
 * throw pas (pas critique au succès du cron lui-même).
 */

import { log } from '@/lib/logger';

const URL_MAP = parseEnv(process.env.CRON_HEALTHCHECK_URLS);

function parseEnv(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  // Format: "name1:https://hc-ping.com/uuid1,name2:https://hc-ping.com/uuid2"
  // On split sur la PREMIÈRE occurence de ":" seulement — sinon "https://" se
  // fait découper en deux.
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const name = trimmed.slice(0, idx).trim();
    const url = trimmed.slice(idx + 1).trim();
    if (name && url.startsWith('http')) {
      map.set(name, url);
    }
  }
  return map;
}

export type CronStatus = 'success' | 'fail' | 'start';

/**
 * Ping un healthcheck pour un cron donné. Best-effort : ne throw jamais (try/
 * catch interne), borné par AbortSignal.timeout(5000ms).
 *
 * ⚠️ DOIT être AWAITÉ dans les handlers cron — surtout PAS `void pingCronHealthcheck(...)`.
 * En serverless (Lambda Amplify), dès que le handler renvoie sa réponse, AWS GÈLE
 * le conteneur : une promesse flottante ne reprend qu'au dégel de la prochaine
 * invocation (parfois des minutes plus tard) ou est PERDUE si le conteneur est
 * recyclé → ping en retard/jamais = fausses alertes « cron down ». (Audit prod
 * 2026-06-05 : `void` ici donnait des fetch « aborted by timeout » au dégel.)
 *
 * Body : optionnel — détails du run (count emails envoyés, etc.) affichés dans
 * le dashboard HC pour debug rapide.
 */
export async function pingCronHealthcheck(
  name: string,
  status: CronStatus = 'success',
  body?: Record<string, unknown>,
): Promise<void> {
  const baseUrl = URL_MAP.get(name);
  if (!baseUrl) {
    // Pas configuré pour ce cron — silencieux (dev local, opt-in)
    return;
  }

  const url = status === 'fail'
    ? `${baseUrl}/fail`
    : status === 'start'
      ? `${baseUrl}/start`
      : baseUrl;

  try {
    await fetch(url, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body).slice(0, 10_000) : undefined,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    log.warn(
      { err, cron: name, status, url: url.slice(0, 60) },
      'healthcheck ping failed (cron itself was OK)',
    );
  }
}
