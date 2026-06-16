import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mcpResourceUri, oauthAuthorizationServer, isOAuthDiscoveryEnabled,
  protectedResourceMetadata, protectedResourceMetadataResponse, MCP_OAUTH_SCOPES,
  OAUTH_DISCOVERY_SCOPES,
} from './oauth-config';

afterEach(() => vi.unstubAllEnvs());

describe('mcpResourceUri — resource canonique (correctif H2)', () => {
  it('défaut = www.plio.ca (host figé, l\'apex POST→405)', () => {
    vi.stubEnv('MCP_RESOURCE_URI', '');
    expect(mcpResourceUri()).toBe('https://www.plio.ca/api/mcp');
  });
  it('override via env, slash final retiré', () => {
    vi.stubEnv('MCP_RESOURCE_URI', 'https://www.plio.ca/api/mcp/');
    expect(mcpResourceUri()).toBe('https://www.plio.ca/api/mcp');
  });
});

describe('découverte OAuth — gardée par MCP_OAUTH_ISSUER', () => {
  it('issuer absent → OFF', () => {
    vi.stubEnv('MCP_OAUTH_ISSUER', '');
    expect(oauthAuthorizationServer()).toBeNull();
    expect(isOAuthDiscoveryEnabled()).toBe(false);
    expect(protectedResourceMetadata()).toBeNull();
  });
  it('issuer présent → ON, slash retiré', () => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://plio.authkit.app/');
    expect(oauthAuthorizationServer()).toBe('https://plio.authkit.app');
    expect(isOAuthDiscoveryEnabled()).toBe(true);
  });
});

describe('protectedResourceMetadata — PRM RFC 9728', () => {
  it('shape correcte + scopes OIDC annoncés (PAS les scopes custom)', () => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://plio.authkit.app');
    vi.stubEnv('MCP_RESOURCE_URI', '');
    const prm = protectedResourceMetadata()!;
    expect(prm.resource).toBe('https://www.plio.ca/api/mcp');
    expect(prm.authorization_servers).toEqual(['https://plio.authkit.app']);
    // La PRM annonce les scopes que claude.ai demande à WorkOS = OIDC standard,
    // PAS nos scopes custom (sinon WorkOS rejette → invalid_scope au callback).
    expect(prm.scopes_supported).toEqual(['openid', 'email', 'profile', 'offline_access']);
    expect(prm.bearer_methods_supported).toEqual(['header']);
  });

  it('découplage : la PRM ne fuit AUCUN scope custom (ni paiement)', () => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://plio.authkit.app');
    const advertised = (protectedResourceMetadata()!.scopes_supported as string[]);
    // Aucun scope d'application Plio dans la requête /authorize (WorkOS ne les connaît pas).
    for (const custom of [...MCP_OAUTH_SCOPES, 'orders:write:headless']) {
      expect(advertised).not.toContain(custom);
    }
    // …et l'octroi interne n'a jamais le scope paiement.
    expect(MCP_OAUTH_SCOPES as readonly string[]).not.toContain('orders:write:headless');
    expect(OAUTH_DISCOVERY_SCOPES as readonly string[]).toContain('email'); // claim email exigé par verify-oauth
  });
});

describe('protectedResourceMetadataResponse — réponse HTTP', () => {
  it('OAuth non configuré → 404 (invisible)', async () => {
    vi.stubEnv('MCP_OAUTH_ISSUER', '');
    const res = protectedResourceMetadataResponse();
    expect(res.status).toBe(404);
  });
  it('configuré → 200 + JSON PRM', async () => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://plio.authkit.app');
    const res = protectedResourceMetadataResponse();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('max-age');
    const body = await res.json();
    expect(body.resource).toBe('https://www.plio.ca/api/mcp');
    expect(body.authorization_servers).toEqual(['https://plio.authkit.app']);
  });
});
