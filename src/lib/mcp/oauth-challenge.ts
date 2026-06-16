/**
 * Challenge OAuth (RFC 9728 §5.1) pour le serveur MCP — OAuth REQUISE.
 *
 * Pour qu'un connecteur apparaisse comme « OAuth » dans claude.ai / ChatGPT (et
 * affiche donc un bouton « Connect »), le serveur DOIT répondre 401 +
 * WWW-Authenticate dès le handshake — PAS seulement sur les tools protégés. Un
 * serveur qui répond 200 en anonyme est classé « sans authentification » → aucun
 * bouton Connect, donc impossible à lister en OAuth (constaté empiriquement
 * 2026-06-16 : claude.ai « ce connecteur n'utilise pas l'authentification »).
 *
 * Donc : tout appel SANS header Authorization reçoit le challenge 401 (initialize,
 * tools/list, tools/call confondus). Les clients qui FOURNISSENT un token (clé API
 * `plio_sk_` ou JWT OAuth) passent → mcpVerifyToken les vérifie dans le handler.
 * L'accès ANONYME sans token disparaît — c'est le prix du listing OAuth (et il n'y
 * a aucun utilisateur anonyme réel : le MCP n'est pas encore listé).
 *
 * GARDÉ par isOAuthEnabled() côté caller (gated) → INERTE tant que MCP_OAUTH est
 * OFF (le serveur reste public/anonyme). S'active avec le flag (enforce en prod).
 */
import { oauthChallengeHeader } from './oauth-config';

/**
 * Renvoie un 401 + WWW-Authenticate si la requête n'a AUCUN header Authorization.
 * Sinon null → le handler vérifie le token (clé API ou JWT). N'échoue jamais.
 */
export function maybeOAuthChallenge(req: Request, bodyText: string): Response | null {
  // Token fourni → laisser mcpVerifyToken / le tool décider (pas de challenge).
  if (req.headers.get('authorization')) return null;

  // Aucun token → OAuth requise : 401 + WWW-Authenticate(resource_metadata→PRM)
  // pour que le client (Claude/ChatGPT) découvre l'AS et affiche « Connect ».
  let id: unknown = null;
  try {
    id = (JSON.parse(bodyText) as { id?: unknown })?.id ?? null;
  } catch {
    // corps non-JSON (ping, GET/SSE…) → id null, on challenge quand même.
  }

  return new Response(
    JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32001, message: 'Authentication required' } }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': oauthChallengeHeader(),
      },
    },
  );
}
