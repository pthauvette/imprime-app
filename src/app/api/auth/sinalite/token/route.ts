/**
 * GET /api/auth/sinalite/token
 *
 * Debug endpoint — vérifie que les credentials Sinalite fonctionnent
 * et renvoie les premiers caractères du token + l'expiration.
 *
 * NE JAMAIS exposer ce endpoint en prod sans auth — il leak un JWT valide.
 * En dev seulement (gated par NODE_ENV).
 */

import { NextResponse } from 'next/server';
import { sinalite } from '@/lib/sinalite/client';
import { withErrorHandler } from '@/lib/api-helpers';

export const GET = withErrorHandler(async () => {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Disabled in production' },
      { status: 403 },
    );
  }

  // Force a token fetch by calling any endpoint
  // (the client wrapper handles caching + decoding)
  await sinalite.listProducts(); // small warmup

  return NextResponse.json({
    ok: true,
    storeCode: sinalite.storeCode,
    apiBase: process.env.SINALITE_API_BASE,
    note: 'Token cached. See server logs for token details.',
  });
});
