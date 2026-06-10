/**
 * GET /.well-known/oauth-protected-resource  (RFC 9728)
 *
 * Métadonnée du « protected resource » qu'est notre serveur MCP : pointe les
 * clients OAuth (Claude/ChatGPT) vers le serveur d'autorisation. C'est l'amorce
 * de la découverte qui permet le listing « 1 clic » dans les annuaires.
 *
 * 404 tant que MCP_OAUTH_ISSUER n'est pas configuré → invisible avant l'activation.
 * Données 100 % publiques (aucun secret). Voir src/lib/mcp/oauth-config.ts.
 */
import { protectedResourceMetadataResponse } from '@/lib/mcp/oauth-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // gardé par env → évalué à la requête

export function GET() {
  return protectedResourceMetadataResponse();
}
