/**
 * GET /.well-known/oauth-protected-resource/api/mcp  (RFC 9728, variante path-spécifique)
 *
 * Certains clients OAuth insèrent le PATH de la resource dans l'URL de découverte
 * (resource = .../api/mcp → /.well-known/oauth-protected-resource/api/mcp). On sert
 * la MÊME métadonnée que la route racine pour couvrir les deux conventions.
 */
import { protectedResourceMetadataResponse } from '@/lib/mcp/oauth-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return protectedResourceMetadataResponse();
}
