import { describe, it, expect, vi, afterEach } from 'vitest';
import { maybeOAuthChallenge, PROTECTED_TOOLS } from './oauth-challenge';
import { protectedResourceMetadataUrl, oauthChallengeHeader } from './oauth-config';

afterEach(() => vi.unstubAllEnvs());

/** Construit une requête MCP (POST JSON-RPC) avec/sans Authorization. */
function mcpReq(body: unknown, opts: { auth?: string } = {}): Request {
  return new Request('https://www.plio.ca/api/mcp/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.auth ? { Authorization: opts.auth } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const call = (name: string, id: number | string = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name } });

describe('oauthChallengeHeader / protectedResourceMetadataUrl', () => {
  it('URL PRM = origine de la resource + chemin well-known', () => {
    vi.stubEnv('MCP_RESOURCE_URI', '');
    expect(protectedResourceMetadataUrl()).toBe('https://www.plio.ca/.well-known/oauth-protected-resource');
  });
  it('header WWW-Authenticate contient resource_metadata vers la PRM', () => {
    vi.stubEnv('MCP_RESOURCE_URI', '');
    const h = oauthChallengeHeader();
    expect(h).toContain('Bearer');
    expect(h).toContain('resource_metadata="https://www.plio.ca/.well-known/oauth-protected-resource"');
  });
});

describe('maybeOAuthChallenge — pattern hybride (RFC 9728)', () => {
  it('tool PROTÉGÉ + AUCUN token → 401 + WWW-Authenticate', () => {
    const res = maybeOAuthChallenge(mcpReq(call('create_order')), JSON.stringify(call('create_order')));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    expect(res!.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
  });

  it('whoami est aussi protégé', () => {
    const body = JSON.stringify(call('whoami'));
    expect(maybeOAuthChallenge(mcpReq(body), body)!.status).toBe(401);
    expect(PROTECTED_TOOLS.has('whoami')).toBe(true);
  });

  it('token FOURNI → null (le handler vérifiera) — pas de challenge', () => {
    const body = JSON.stringify(call('create_order'));
    expect(maybeOAuthChallenge(mcpReq(body, { auth: 'Bearer plio_sk_x' }), body)).toBeNull();
  });

  it('tool READ-ONLY anonyme → null (reste 200 anonyme)', () => {
    for (const t of ['list_print_products', 'get_print_quote', 'estimate_shipping', 'get_product_options']) {
      const body = JSON.stringify(call(t));
      expect(maybeOAuthChallenge(mcpReq(body), body)).toBeNull();
    }
  });

  it('méthode ≠ tools/call (initialize, tools/list) → null', () => {
    for (const m of ['initialize', 'tools/list', 'ping']) {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: m });
      expect(maybeOAuthChallenge(mcpReq(body), body)).toBeNull();
    }
  });

  it('corps non-JSON → null (pas de crash)', () => {
    expect(maybeOAuthChallenge(mcpReq('pas du json'), 'pas du json')).toBeNull();
  });

  it('le body du 401 écho l\'id de la requête (JSON-RPC propre)', async () => {
    const body = JSON.stringify(call('create_order', 'abc-42'));
    const res = maybeOAuthChallenge(mcpReq(body), body)!;
    const json = await res.json();
    expect(json.id).toBe('abc-42');
    expect(json.error.code).toBe(-32001);
  });
});
