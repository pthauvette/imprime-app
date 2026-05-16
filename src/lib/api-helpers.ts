/**
 * Helpers communs pour les Route Handlers Next.js — gestion d'erreurs cohérente.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SinaliteError } from './sinalite/client';

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
        return NextResponse.json<ApiError>(
          {
            error: `Erreur Sinalite: ${err.message}`,
            code: 'SINALITE_ERROR',
            details: { status: err.status, endpoint: err.endpoint, body: err.body },
          },
          { status },
        );
      }
      const message = err instanceof Error ? err.message : 'Erreur interne';
      console.error('[api]', err);
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
