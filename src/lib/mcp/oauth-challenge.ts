/**
 * Challenge OAuth (RFC 9728 §5.1) pour le serveur MCP — pattern HYBRIDE.
 *
 * Le serveur MCP de Plio est en `required: false` : les 4 tools read-only
 * (catalogue/options/devis/livraison) répondent 200 ANONYME. Mais un connecteur
 * claude.ai (strict) a besoin d'un `401 + WWW-Authenticate: …resource_metadata=…`
 * pour DÉCOUVRIR que l'OAuth est disponible (sinon il traite le serveur comme
 * authless et n'offre jamais « se connecter »).
 *
 * Solution : quand un tool PROTÉGÉ (whoami/create_order) est appelé SANS aucun
 * Authorization, on renvoie le challenge → Claude suit vers la PRM → AS → DCR,
 * s'authentifie, et rejoue avec un token. Les read-only restent 200/anonymes.
 *
 * GARDÉ par isOAuthEnabled() côté caller → INERTE tant que le flag MCP_OAUTH est
 * OFF (comportement byte-identique à aujourd'hui). S'active EN LOCKSTEP avec
 * l'acceptation des tokens, quand WorkOS aura activé le DCR.
 */
import { oauthChallengeHeader } from './oauth-config';

/** Tools MCP qui exigent une identité (requireUser/requireScope dans le handler). */
export const PROTECTED_TOOLS = new Set(['whoami', 'create_order']);

/**
 * Renvoie un 401 + WWW-Authenticate SI (et seulement si) : aucun header
 * Authorization ET le corps est un `tools/call` vers un tool protégé. Sinon null
 * → flux normal (read-only anonyme, ou token fourni que le handler vérifiera).
 *
 * Ne consomme PAS `req` (le corps est passé déjà bufferisé par le caller, qui
 * doit reconstruire la requête pour le handler).
 */
export function maybeOAuthChallenge(req: Request, bodyText: string): Response | null {
  // Un token est fourni → laisser mcpVerifyToken/le tool décider (pas de challenge).
  if (req.headers.get('authorization')) return null;

  let id: unknown = null;
  let name: unknown;
  try {
    const msg = JSON.parse(bodyText) as { method?: unknown; id?: unknown; params?: { name?: unknown } };
    if (msg?.method !== 'tools/call') return null;
    id = msg.id ?? null;
    name = msg.params?.name;
  } catch {
    return null; // corps non-JSON (ex. GET/SSE) → flux normal
  }

  if (typeof name !== 'string' || !PROTECTED_TOOLS.has(name)) return null;

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
