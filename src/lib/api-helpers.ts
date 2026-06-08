/**
 * Helpers communs pour les Route Handlers Next.js — gestion d'erreurs cohérente.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SinaliteError } from './sinalite/client';
import { log } from './logger';

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Garde CSRF best-effort : rejette une MUTATION dont l'en-tête `Origin` est
 * cross-site. Défense en profondeur en plus de SameSite=Lax (ferme le vecteur
 * form-POST top-level cross-site + sous-domaine compromis).
 *
 * Robuste multi-host (apex + www + preview + CloudFront/Amplify) : on accepte si
 * l'Origin correspond à L'UN des signaux de host fiables — `x-forwarded-host`
 * (posé par l'edge, = host public réel), le `Host` de la requête, ou le host
 * canonique `NEXT_PUBLIC_APP_URL`. On ne rejette que si l'Origin ne matche AUCUN.
 * L'attaquant CSRF ne contrôle pas l'en-tête Origin (posé par le navigateur), ni
 * `x-forwarded-host` (posé par l'edge) → il ne peut pas les faire coïncider.
 *
 * Origin ABSENT = toléré (server-to-server, app native, curl l'omettent) → on
 * s'appuie sur SameSite=Lax. Retourne une 403 à renvoyer, ou null si OK.
 */
export function assertSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json<ApiError>({ error: 'Origine invalide', code: 'BAD_ORIGIN' }, { status: 403 });
  }
  const accepted = new Set<string>();
  const xfh = req.headers.get('x-forwarded-host');
  if (xfh) accepted.add(xfh.split(',')[0].trim());
  const host = req.headers.get('host');
  if (host) accepted.add(host);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try { accepted.add(new URL(appUrl).host); } catch { /* ignore */ }
  }
  // Aucun host de référence (cas dégradé) → tolère plutôt que casser.
  if (accepted.size === 0 || accepted.has(originHost)) return null;
  return NextResponse.json<ApiError>({ error: 'Origine non autorisée', code: 'CROSS_ORIGIN' }, { status: 403 });
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Wrap un handler async avec error handling unifié + garde CSRF best-effort.
 *
 * CSRF : sur les MUTATIONS (POST/PUT/PATCH/DELETE), rejette un Origin cross-site
 * (assertSameOrigin) — défense en profondeur pour TOUTES les routes wrappées, en
 * plus de SameSite=Lax. Les lectures (GET/HEAD) sont exemptées. Les webhooks
 * (export async function POST, signature vérifiée) et le MCP (Bearer) N'utilisent
 * PAS withErrorHandler → ils restent cross-origin, comme requis.
 */
export function withErrorHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    const req = args[0];
    if (req instanceof Request && MUTATION_METHODS.has(req.method)) {
      const csrf = assertSameOrigin(req);
      if (csrf) return csrf;
    }
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json<ApiError>(
          { error: 'Données invalides', code: 'VALIDATION', details: err.flatten() },
          { status: 400 },
        );
      }
      if (err instanceof SinaliteError) {
        const status = err.status >= 500 ? 502 : err.status;
        // Audit v2 #6.6 — NE PAS exposer endpoint/body Sinalite (détails internes
        // de l'API imprimeur) ni le message brut au client. Tout est loggé côté
        // serveur ; le client reçoit un message générique.
        log.error(
          { err, status: err.status, endpoint: err.endpoint, body: err.body },
          'Sinalite error',
        );
        return NextResponse.json<ApiError>(
          {
            error: "Le service d'impression est temporairement indisponible. Réessaie dans un instant.",
            code: 'SINALITE_ERROR',
          },
          { status },
        );
      }
      // Audit v2 #6.6 — message générique en PROD (le message brut d'une Error
      // peut fuiter des détails internes : erreurs DB, chemins, requêtes). Le
      // détail complet est loggé serveur. En dev/test on garde le message pour
      // le DX.
      log.error({ err }, 'api handler error');
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Une erreur interne est survenue.'
          : err instanceof Error
            ? err.message
            : 'Erreur interne';
      return NextResponse.json<ApiError>(
        { error: message, code: 'INTERNAL' },
        { status: 500 },
      );
    }
  };
}

/** Parse + validate un Request body avec un schema Zod. */
export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const json = await req.json().catch(() => {
    throw new z.ZodError([{
      code: 'custom',
      path: [],
      message: 'JSON invalide dans le body',
    }]);
  });
  return schema.parse(json);
}

/** Parse + validate les search params d'une URL. */
export function parseSearchParams<T>(
  url: URL,
  schema: z.ZodType<T>,
): T {
  const obj = Object.fromEntries(url.searchParams.entries());
  return schema.parse(obj);
}
