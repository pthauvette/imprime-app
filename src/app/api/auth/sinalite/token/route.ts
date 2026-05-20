/**
 * GET /api/auth/sinalite/token
 *
 * Debug endpoint admin-only — vérifie que les credentials Sinalite
 * fonctionnent. Ne révèle JAMAIS le token complet ; juste storeCode +
 * confirmation que listProducts() a marché.
 *
 * Round 17 #3 : tightened à requireAdmin() (avant : juste NODE_ENV gate
 * qui laissait passer en staging/preview où SINALITE_API_BASE est leaked
 * dans le response). En prod, seul ADMIN peut hit.
 */

import { NextResponse } from 'next/server';
import { sinalite } from '@/lib/sinalite/client';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';

export const GET = withErrorHandler(async () => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // Force a token fetch by calling any endpoint
  // (the client wrapper handles caching + decoding)
  await sinalite.listProducts(); // small warmup

  return NextResponse.json({
    ok: true,
    storeCode: sinalite.storeCode,
    // Ne plus expose SINALITE_API_BASE (env leak). Le storeCode suffit
    // pour identifier l'environnement (stage vs prod).
    note: 'Token cached. See server logs for token details.',
    adminEmail: guard.user.email,
  });
});
