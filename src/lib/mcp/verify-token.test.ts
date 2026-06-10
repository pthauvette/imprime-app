import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  verifyApiKey: vi.fn(),
  verifyOAuthBearer: vi.fn(),
  isOAuthEnabled: vi.fn(),
}));
vi.mock('@/lib/mcp/auth', () => ({ verifyApiKey: h.verifyApiKey }));
vi.mock('@/lib/mcp/verify-oauth', () => ({ verifyOAuthBearer: h.verifyOAuthBearer }));
vi.mock('@/lib/mcp/oauth-config', () => ({ isOAuthEnabled: h.isOAuthEnabled }));

import { mcpVerifyToken } from './verify-token';

const STATIC_KEY = 'plio_sk_live_abc123';
const OAUTH_JWT = 'eyJhbGciOiJFUzI1NiJ9.payload.sig';
const req = new Request('https://www.plio.ca/api/mcp/mcp');

beforeEach(() => {
  vi.clearAllMocks();
  h.verifyApiKey.mockResolvedValue(null);
  h.verifyOAuthBearer.mockResolvedValue(null);
  h.isOAuthEnabled.mockReturnValue(false);
});

describe('mcpVerifyToken — clé statique (chemin INCHANGÉ)', () => {
  it('pas de token → undefined', async () => {
    expect(await mcpVerifyToken(req, undefined)).toBeUndefined();
  });

  it('clé statique valide → AuthInfo (keyId, jamais le secret)', async () => {
    h.verifyApiKey.mockResolvedValue({ keyId: 'k1', userId: 'u1', scopes: ['catalog:read'], role: 'USER' });
    const info = await mcpVerifyToken(req, STATIC_KEY);
    expect(info).toEqual({ token: 'k1', clientId: 'u1', scopes: ['catalog:read'], extra: { userId: 'u1', keyId: 'k1', role: 'USER' } });
    expect(h.verifyOAuthBearer).not.toHaveBeenCalled(); // jamais d'OAuth pour une clé statique
  });
});

describe('mcpVerifyToken — flag OAuth OFF (byte-identique à avant)', () => {
  it('JWT OAuth + flag off → undefined, verifyOAuthBearer JAMAIS appelé', async () => {
    h.isOAuthEnabled.mockReturnValue(false);
    const info = await mcpVerifyToken(req, OAUTH_JWT);
    expect(info).toBeUndefined();
    expect(h.verifyOAuthBearer).not.toHaveBeenCalled();
  });
});

describe('mcpVerifyToken — flag OAuth ON', () => {
  beforeEach(() => h.isOAuthEnabled.mockReturnValue(true));

  it('JWT OAuth valide → AuthInfo (authVia oauth, role USER, pas le JWT brut)', async () => {
    h.verifyOAuthBearer.mockResolvedValue({ userId: 'u2', scopes: ['catalog:read', 'orders:write'], role: 'USER', subject: 'workos_sub' });
    const info = await mcpVerifyToken(req, OAUTH_JWT);
    expect(info).toEqual({
      token: 'workos_sub',
      clientId: 'u2',
      scopes: ['catalog:read', 'orders:write'],
      extra: { userId: 'u2', role: 'USER', authVia: 'oauth' },
    });
    expect(h.verifyOAuthBearer).toHaveBeenCalledWith(OAUTH_JWT);
  });

  it('JWT OAuth invalide (verifyOAuthBearer null) → undefined', async () => {
    h.verifyOAuthBearer.mockResolvedValue(null);
    expect(await mcpVerifyToken(req, OAUTH_JWT)).toBeUndefined();
  });

  it('clé statique valide → toujours la clé, OAuth JAMAIS tenté (aiguillage binaire)', async () => {
    h.verifyApiKey.mockResolvedValue({ keyId: 'k1', userId: 'u1', scopes: [], role: 'USER' });
    const info = await mcpVerifyToken(req, STATIC_KEY);
    expect(info?.clientId).toBe('u1');
    expect(h.verifyOAuthBearer).not.toHaveBeenCalled();
  });

  it('clé statique INVALIDE (plio_sk_ mais verifyApiKey null) → undefined, OAuth JAMAIS tenté', async () => {
    h.verifyApiKey.mockResolvedValue(null);
    const info = await mcpVerifyToken(req, 'plio_sk_live_revoked');
    expect(info).toBeUndefined();
    expect(h.verifyOAuthBearer).not.toHaveBeenCalled(); // strict : un plio_sk_ ne tombe jamais sur l'OAuth
  });
});
