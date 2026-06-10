/**
 * Config OAuth du serveur MCP (listing public Claude/ChatGPT).
 *
 * UNE seule source de vérité pour le `resource` canonique — utilisée par la
 * métadonnée PRM (RFC 9728), la validation d'audience du token (PR2) et le
 * `resourceUrl` passé à withMcpAuth (PR3). Correctif H2 de la revue adversariale :
 * tout dériver d'ici neutralise le spoof de `x-forwarded-host` (token-confusion).
 *
 * Lectures d'env à l'APPEL (pas au load) → testable + reconfigurable sans rebuild.
 */

/** Resource canonique du MCP. Host figé = www.plio.ca (l'apex plio.ca est un
 *  redirecteur GET/HEAD-only → un POST y renvoie 405). Override via MCP_RESOURCE_URI. */
export function mcpResourceUri(): string {
  return (process.env.MCP_RESOURCE_URI?.trim() || 'https://www.plio.ca/api/mcp').replace(/\/+$/, '');
}

/** Scopes qu'une identité OAuth peut obtenir. JAMAIS orders:write:headless (paiement) :
 *  correctif M2, le scope de confiance reste réservé aux clés admin. */
export const MCP_OAUTH_SCOPES = ['catalog:read', 'orders:write'] as const;

/** URL du serveur d'autorisation (WorkOS AuthKit). Vide → découverte OAuth OFF. */
export function oauthAuthorizationServer(): string | null {
  const issuer = process.env.MCP_OAUTH_ISSUER?.trim();
  return issuer ? issuer.replace(/\/+$/, '') : null;
}

/** La découverte OAuth est-elle activée ? (= un AS est configuré.) */
export function isOAuthDiscoveryEnabled(): boolean {
  return oauthAuthorizationServer() !== null;
}

/** Kill-switch d'ACCEPTATION des access tokens OAuth dans verifyToken. OFF par
 *  défaut → mcpVerifyToken se comporte exactement comme avant (clés statiques only).
 *  Activer (`MCP_OAUTH=enforce`/`1`) APRÈS config WorkOS + vérif logs (PR5). */
export function isOAuthEnabled(): boolean {
  const v = process.env.MCP_OAUTH?.trim();
  return v === '1' || v === 'enforce';
}

/** Document PRM (RFC 9728) — données 100 % publiques. null si OAuth non configuré. */
export function protectedResourceMetadata(): Record<string, unknown> | null {
  const as = oauthAuthorizationServer();
  if (!as) return null;
  return {
    resource: mcpResourceUri(),
    authorization_servers: [as],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Plio MCP Server',
  };
}

/** Réponse HTTP de la route PRM. 404 tant que OAuth n'est pas configuré (invisible). */
export function protectedResourceMetadataResponse(): Response {
  const prm = protectedResourceMetadata();
  if (!prm) {
    return new Response('OAuth discovery not configured', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return Response.json(prm, {
    status: 200,
    // Métadonnée stable mais re-configurable → cache CDN court.
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
