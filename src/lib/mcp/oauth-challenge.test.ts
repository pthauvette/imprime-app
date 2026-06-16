import { describe, it, expect, vi, afterEach } from 'vitest';
import { maybeOAuthChallenge } from './oauth-challenge';
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

describe('maybeOAuthChallenge — OAuth REQUISE (RFC 9728)', () => {
  // Le serveur doit répondre 401 dès le handshake sur TOUT appel sans token,
  // sinon claude.ai/ChatGPT le classent « sans authentification » → pas de
  // bouton Connect, donc impossible à lister en OAuth.

  it('AUCUN token, n\'importe quel tool/call → 401 + WWW-Authenticate', () => {
    for (const t of [
      'create_order',
      'whoami',
      'list_print_products',
      'get_print_quote',
      'estimate_shipping',
      'get_product_options',
    ]) {
      const body = JSON.stringify(call(t));
      const res = maybeOAuthChallenge(mcpReq(body), body);
      expect(res, t).not.toBeNull();
      expect(res!.status, t).toBe(401);
      expect(res!.headers.get('WWW-Authenticate'), t).toContain('resource_metadata=');
    }
  });

  it('AUCUN token sur initialize / tools/list / ping → 401 aussi (handshake)', () => {
    for (const m of ['initialize', 'tools/list', 'ping']) {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: m });
      const res = maybeOAuthChallenge(mcpReq(body), body);
      expect(res, m).not.toBeNull();
      expect(res!.status, m).toBe(401);
    }
  });

  it('token FOURNI → null (le handler vérifiera clé API ou JWT)', () => {
    const body = JSON.stringify(call('create_order'));
    expect(maybeOAuthChallenge(mcpReq(body, { auth: 'Bearer plio_sk_x' }), body)).toBeNull();
    expect(maybeOAuthChallenge(mcpReq(body, { auth: 'Bearer eyJ.jwt.token' }), body)).toBeNull();
  });

  it('corps non-JSON sans token → 401 quand même (id null, pas de crash)', async () => {
    const res = maybeOAuthChallenge(mcpReq('pas du json'), 'pas du json');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    const json = await res!.json();
    expect(json.id).toBeNull();
    expect(json.error.code).toBe(-32001);
  });

  it('le body du 401 écho l\'id de la requête (JSON-RPC propre)', async () => {
    const body = JSON.stringify(call('create_order', 'abc-42'));
    const res = maybeOAuthChallenge(mcpReq(body), body)!;
    const json = await res.json();
    expect(json.id).toBe('abc-42');
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('Authentication');
  });
});
