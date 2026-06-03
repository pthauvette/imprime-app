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

/** Wrap un handler async avec error handling unifié. */
export function withErrorHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
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
