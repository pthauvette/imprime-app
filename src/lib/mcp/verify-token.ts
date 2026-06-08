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

export async function mcpVerifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  let v;
  try {
    v = await verifyApiKey(bearerToken); // déjà total ; double garde par prudence
  } catch {
    return undefined;
  }
  if (!v) return undefined;
  return {
    token: v.keyId, // PAS le secret (anti-fuite logs/Sentry)
    clientId: v.userId,
    scopes: v.scopes, // toujours un tableau (jamais undefined)
    extra: { userId: v.userId, keyId: v.keyId, role: v.role },
  };
}
