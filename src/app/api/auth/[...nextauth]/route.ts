/**
 * Auth.js v5 catch-all route — délègue tout vers les handlers configurés
 * dans `src/auth.ts`. Couvre /api/auth/signin, /api/auth/callback/[provider],
 * /api/auth/signout, /api/auth/session, etc.
 *
 * Wrapper rate-limit sur POST /api/auth/signin/* uniquement — anti-spam
 * magic links vers victims (SES quota cost + protection brand Plio).
 * Tous les autres endpoints (callback, session, csrf, etc.) sont
 * passthrough sans gate — ils sont déjà self-rate-limited par Auth.js.
 */

import type { NextRequest } from 'next/server';
import { GET as AuthGet, POST as AuthPost } from '@/auth-handlers';
import { rateLimit, clientIp } from '@/lib/ratelimit';

export const GET = AuthGet;

export async function POST(req: NextRequest) {
  // Match /api/auth/signin/<provider> exactly — rate-limit pour anti-spam
  // magic links vers victims (SES quota cost + phishing chain mitigation).
  // Tous les autres endpoints (callback, session, csrf, etc.) sont
  // passthrough — déjà self-rate-limited par Auth.js.
  if (req.nextUrl.pathname.startsWith('/api/auth/signin/')) {
    const limit = await rateLimit('signin', clientIp(req));
    if (!limit.ok) return limit.response;
  }
  return AuthPost(req);
}
