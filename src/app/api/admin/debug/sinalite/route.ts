/**
 * GET /api/admin/debug/sinalite
 *
 * Debug endpoint ADMIN-ONLY pour diagnostiquer l'intégration Sinalite
 * sans attendre Sentry. Tape directement l'auth + un produit, retourne
 * tout le contexte raw.
 *
 * Retourne :
 *   {
 *     env: { apiBase, authBase, audience, storeCode, clientIdPrefix } — pas de secret,
 *     authCall: { status, ok, contentType, bodyShape, bodyKeys, sampleString },
 *     productCall: { status, ok, contentType, bodyShape, bodyKeys, sample }
 *   }
 *
 * À supprimer après diagnostic. Auth strict admin pour éviter leak.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function inspectResponse(res: Response) {
  const contentType = res.headers.get('content-type') ?? '';
  let body: unknown = null;
  let bodyType = 'unknown';
  let bodyKeys: string[] = [];
  let sampleString = '';
  try {
    const text = await res.text();
    sampleString = text.slice(0, 1500);
    if (contentType.includes('json')) {
      try {
        body = JSON.parse(text);
        bodyType = Array.isArray(body) ? `array(len=${(body as unknown[]).length})` : typeof body;
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          bodyKeys = Object.keys(body as Record<string, unknown>);
        }
      } catch {
        bodyType = 'invalid-json';
      }
    } else {
      bodyType = `text/${contentType}`;
    }
  } catch (err) {
    sampleString = `<read-error: ${err instanceof Error ? err.message : 'unknown'}>`;
  }
  return {
    status: res.status,
    ok: res.ok,
    contentType,
    bodyType,
    bodyKeys,
    sampleString,
  };
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const apiBase = process.env.SINALITE_API_BASE ?? '<unset>';
  const authBase = process.env.SINALITE_AUTH_BASE ?? '<unset>';
  const audience = process.env.SINALITE_AUDIENCE ?? '<unset>';
  const storeCode = process.env.SINALITE_STORE_CODE ?? '<unset>';
  const clientId = process.env.SINALITE_CLIENT_ID ?? '';
  const clientSecret = process.env.SINALITE_CLIENT_SECRET ?? '';

  const env = {
    apiBase,
    authBase,
    audience,
    storeCode,
    clientIdPrefix: clientId.slice(0, 6) + '...' + (clientId.length ? `(len=${clientId.length})` : ''),
    clientSecretPresent: clientSecret.length > 0,
    clientSecretLen: clientSecret.length,
  };

  // 1. Auth call
  let authCall: Awaited<ReturnType<typeof inspectResponse>> | { error: string } | null = null;
  try {
    const authRes = await fetch(`${authBase}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        audience,
        grant_type: 'client_credentials',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    authCall = await inspectResponse(authRes);
  } catch (err) {
    authCall = { error: err instanceof Error ? err.message : 'fetch-error' };
  }

  // 2. Product call (uniquement si auth a réussi)
  let productCall: Awaited<ReturnType<typeof inspectResponse>> | { error: string; skipped?: boolean } | null = null;
  if (authCall && 'sampleString' in authCall && authCall.ok) {
    try {
      const parsed = JSON.parse(authCall.sampleString) as Record<string, unknown>;
      const token = parsed.access_token ?? parsed.accessToken ?? parsed.token;
      if (typeof token === 'string') {
        const prodRes = await fetch(`${apiBase}/product`, {
          method: 'GET',
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        productCall = await inspectResponse(prodRes);
      } else {
        productCall = { error: 'no token in auth response', skipped: true };
      }
    } catch (err) {
      productCall = { error: err instanceof Error ? err.message : 'fetch-error' };
    }
  } else {
    productCall = { error: 'skipped because auth failed', skipped: true };
  }

  return NextResponse.json({
    env,
    authCall,
    productCall,
    hint: 'Compare bodyKeys + bodyType to expected SinaliteTokenResponse {access_token, token_type} schema',
  });
}
