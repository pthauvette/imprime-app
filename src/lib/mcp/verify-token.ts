/**
 * verifyToken pour `withMcpAuth` (mcp-handler).
 *
 * TOTAL — ne throw JAMAIS : mcp-handler transforme tout throw de verifyToken en
 * 401 + WWW-Authenticate AVANT le test `required:false`, ce qui casserait les
 * tools read-only publics et déclencherait la découverte OAuth des clients. Pas
 * de credentials ou clé invalide → `undefined` (= anonyme, HTTP 200 ; les
 * mutations rejetteront via requireUser/requireScope dans le tool).
 *
 * ⚠️ On NE place PAS le token en clair dans AuthInfo.token : les tools ne lisent
 * que `extra`, et AuthInfo peut être sérialisé par les logs verbeux / Sentry. On
 * y met le keyId (non sensible).
 */
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { verifyApiKey } from '@/lib/mcp/auth';
import { verifyOAuthBearer } from '@/lib/mcp/verify-oauth';
import { isOAuthEnabled } from '@/lib/mcp/oauth-config';

export async function mcpVerifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  // 1) Clé API statique. verifyApiKey pré-filtre `plio_sk_` → null sans coût DB
  //    pour tout autre format. Chemin INCHANGÉ (clés Claude Code / mcp-remote / B2B).
  let v;
  try {
    v = await verifyApiKey(bearerToken); // déjà total ; double garde par prudence
  } catch {
    return undefined;
  }
  if (v) {
    return {
      token: v.keyId, // PAS le secret (anti-fuite logs/Sentry)
      clientId: v.userId,
      scopes: v.scopes, // toujours un tableau (jamais undefined)
      extra: { userId: v.userId, keyId: v.keyId, role: v.role },
    };
  }

  // 2) Fallback OAuth (JWT WorkOS) — UNIQUEMENT si le flag est ON et que ce n'est
  //    PAS une clé statique (aiguillage binaire strict, correctif L3). Flag OFF →
  //    on saute tout → comportement byte-identique à avant (clés statiques only).
  //    verifyOAuthBearer est TOTAL (jamais throw) → la garantie required:false tient.
  if (isOAuthEnabled() && !bearerToken.startsWith('plio_sk_')) {
    const o = await verifyOAuthBearer(bearerToken);
    if (o) {
      return {
        token: o.subject || 'oauth', // le `sub` (non sensible), JAMAIS le JWT brut
        clientId: o.userId,
        scopes: o.scopes,
        extra: { userId: o.userId, role: o.role, authVia: 'oauth' },
      };
    }
  }

  return undefined; // anonyme — jamais throw (read-only public préservé)
}
