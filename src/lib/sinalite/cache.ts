/**
 * Write-through offline cache pour les endpoints catalog Sinalite.
 *
 * Stratégie :
 *   1. Tente le fetcher (live Sinalite API)
 *   2. Succès → write payload en DB (SinaliteCacheEntry, upsert par key)
 *           → retourne le fresh data
 *   3. Échec (SinaliteError, network, timeout) → read cache
 *      - cache hit  → log warn + Slack alert (1 fois par minute) + retourne stale
 *      - cache miss → re-throw (pas de fallback possible)
 *
 * Caller indique la `key` (typically le URL path Sinalite) pour grouper
 * les hits. Le payload est stocké comme JSON string.
 *
 * Use case : Sinalite a des outages réguliers (auth tokens, 502 transitoires).
 * Sans cette couche, /order/start affiche un 500 → conversion drop. Avec :
 * le wizard tourne sur les data d'il y a quelques minutes/heures, le user
 * peut quand même configurer + payer. Au pire les prix ont bougé de 0.05$.
 */

import { prisma } from '@/lib/db';
import { logSinalite } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';

interface CacheStats {
  /** Combien d'appels stale ont été servis depuis le démarrage du processus. */
  staleServed: number;
  /** Dernière fois qu'on a envoyé un Slack alert (throttle 1/minute). */
  lastAlertAt: number;
}

const stats: CacheStats = { staleServed: 0, lastAlertAt: 0 };

/** Slack alert throttle : pas plus d'un par minute par process. */
const ALERT_THROTTLE_MS = 60 * 1000;

export interface WithCacheOptions {
  /** Si true, ne write pas en cache même si fetcher succeed. Pour mutations. */
  readOnly?: boolean;
  /**
   * Round 36 #3 — TTL en ms. Si le cache row a été écrit dans la fenêtre,
   * on retourne le cached value directement SANS appeler Sinalite.
   * Évite 1 round-trip Sinalite par catalog request quand le data n'a
   * pas changé. Si absent (legacy), fetch toujours fresh + fallback stale
   * uniquement si fetcher throw.
   */
  ttlMs?: number;
}

/**
 * Round 36 #3 — TTL default pour les catalog reads Sinalite.
 * Catalog change rarement (prix update mensuel, options structurelles rares).
 * 10 min = compromis sain : élimine 99 % des hits live + reste raisonnablement
 * frais pour les wizard users.
 */
export const SINALITE_CATALOG_TTL_MS = 10 * 60 * 1000;

/**
 * Wrap un fetcher Sinalite avec lecture/écriture cache + fallback stale.
 *
 * @param key URL path ou identifiant unique (ex: '/product', 'product:7').
 * @param fetcher Async fonction qui appelle Sinalite.
 * @returns Le payload (typé T). Peut être un fresh fetch OU une stale row.
 * @throws Si fetcher fail ET pas de cache disponible.
 */
export async function withSinaliteCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: WithCacheOptions = {},
): Promise<T> {
  // Round 36 #3 — Fast-path TTL : si le cache est "frais" (< ttlMs),
  // retourne directement sans appeler Sinalite. Évite le round-trip
  // sur les catalog reads (listProducts, getProductDetail, etc.).
  if (options.ttlMs) {
    const cached = await readCache<T>(key);
    if (cached !== null) {
      const ageMs = Date.now() - cached.updatedAt.getTime();
      if (ageMs < options.ttlMs) {
        return cached.payload;
      }
    }
  }

  try {
    const fresh = await fetcher();
    // Write-through : persist au cache pour le prochain outage
    if (!options.readOnly) {
      // Best-effort : si l'écriture cache fail (DB down), on log mais on
      // retourne quand même les fresh data — c'est le success path normal.
      void writeCache(key, fresh).catch((err) => {
        logSinalite.warn({ err, key }, 'cache write failed (data fresh OK)');
      });
    }
    return fresh;
  } catch (fetchErr) {
    const cached = await readCache<T>(key);
    if (cached === null) {
      logSinalite.error(
        { err: fetchErr, key },
        'Sinalite fetch failed AND no cache available — rethrow',
      );
      throw fetchErr;
    }

    // Stale served — log + alert (throttled)
    stats.staleServed += 1;
    logSinalite.warn(
      {
        err: fetchErr,
        key,
        cachedAt: cached.updatedAt,
        staleAgeMs: Date.now() - cached.updatedAt.getTime(),
      },
      'Sinalite fetch failed — serving stale cache',
    );

    const now = Date.now();
    if (now - stats.lastAlertAt > ALERT_THROTTLE_MS) {
      stats.lastAlertAt = now;
      void sendCriticalAlert({
        severity: 'warning',
        title: 'Sinalite API down — serving stale cache',
        body: `Les requêtes Sinalite échouent. On sert des data cachées (ok pour le checkout, prix potentiellement périmés). Investigue.`,
        context: {
          key,
          cachedAt: cached.updatedAt.toISOString(),
          staleAgeMinutes: Math.round((now - cached.updatedAt.getTime()) / 60_000),
          error: fetchErr instanceof Error ? fetchErr.message : 'unknown',
          staleServedThisProcess: stats.staleServed,
        },
      });
    }

    return cached.payload;
  }
}

interface CacheRead<T> {
  payload: T;
  updatedAt: Date;
}

/** Read raw cache row. Pas de Slack alert ici — c'est le caller qui décide. */
export async function readCache<T>(key: string): Promise<CacheRead<T> | null> {
  try {
    const row = await prisma.sinaliteCacheEntry.findUnique({
      where: { key },
      select: { payload: true, updatedAt: true },
    });
    if (!row) return null;
    return {
      payload: JSON.parse(row.payload) as T,
      updatedAt: row.updatedAt,
    };
  } catch (err) {
    // Cache read failure (parse fail, DB down) → silent miss
    logSinalite.warn({ err, key }, 'cache read failed (treating as miss)');
    return null;
  }
}

/** Write/overwrite cache row par key. Idempotent. */
export async function writeCache<T>(key: string, payload: T): Promise<void> {
  const json = JSON.stringify(payload);
  await prisma.sinaliteCacheEntry.upsert({
    where: { key },
    create: { key, payload: json, statusCode: 200 },
    update: { payload: json, statusCode: 200 },
  });
}

/** Stats pour /admin/sinalite-cache (future) ou debug. */
export function getCacheStats(): Readonly<CacheStats> {
  return { ...stats };
}
