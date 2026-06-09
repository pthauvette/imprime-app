import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mcpResourceUri, oauthAuthorizationServer, isOAuthDiscoveryEnabled,
  protectedResourceMetadata, protectedResourceMetadataResponse, MCP_OAUTH_SCOPES,
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
  it('shape correcte + scopes restreints (JAMAIS orders:write:headless)', () => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://plio.authkit.app');
    vi.stubEnv('MCP_RESOURCE_URI', '');
    const prm = protectedResourceMetadata()!;
    expect(prm.resource).toBe('https://www.plio.ca/api/mcp');
    expect(prm.authorization_servers).toEqual(['https://plio.authkit.app']);
    expect(prm.scopes_supported).toEqual(['catalog:read', 'orders:write']);
    expect(prm.bearer_methods_supported).toEqual(['header']);
    // Garde-fou : le scope paiement n'est JAMAIS annoncé/octroyable via OAuth public.
    expect(prm.scopes_supported as string[]).not.toContain('orders:write:headless');
    expect(MCP_OAUTH_SCOPES as readonly string[]).not.toContain('orders:write:headless');
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
