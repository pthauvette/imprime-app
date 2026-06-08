import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findUnique, update } = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { apiKey: { findUnique, update } } }));
vi.mock('@/lib/logger', () => ({ logAuth: { warn: vi.fn() } }));

import {
  generateApiKey, hashApiKey, parseScopes, isKeyUsable,
  verifyApiKey, requireUser, requireScope,
} from './auth';
import { mcpVerifyToken } from './verify-token';

beforeEach(() => { findUnique.mockReset(); update.mockReset(); update.mockResolvedValue({}); });

describe('MCP auth — génération & hash', () => {
  it('generateApiKey : préfixe live, dérivés cohérents, entropie', () => {
    const a = generateApiKey();
    expect(a.token.startsWith('plio_sk_live_')).toBe(true);
    expect(a.keyHash).toBe(hashApiKey(a.token));
    expect(a.keyPrefix).toBe(a.token.slice(0, 'plio_sk_live_'.length + 6));
    expect(generateApiKey().token).not.toBe(a.token); // aléatoire
  });

  it('hashApiKey : déterministe, 64 hex lowercase (invariant)', () => {
    const h = hashApiKey('plio_sk_live_abc');
    expect(h).toBe(hashApiKey('plio_sk_live_abc'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('MCP auth — parseScopes (whitelist + normalisation)', () => {
  it('trim + lowercase + whitelist + dédup', () => {
    expect(parseScopes('orders:write,catalog:read')).toEqual(['orders:write', 'catalog:read']);
    expect(parseScopes(' Orders:Write ')).toEqual(['orders:write']);
    expect(parseScopes('orders:write,orders:write')).toEqual(['orders:write']); // dédup
    expect(parseScopes('bogus,catalog:read')).toEqual(['catalog:read']); // inconnu filtré
    expect(parseScopes('orders:write:headless')).toEqual(['orders:write:headless']); // scope sensible connu
    expect(parseScopes('')).toEqual([]);
    expect(parseScopes(null)).toEqual([]);
  });
});

describe('MCP auth — isKeyUsable', () => {
  const now = new Date('2026-06-08T00:00:00Z');
  it('révoquée → inutilisable', () => {
    expect(isKeyUsable({ revokedAt: now, expiresAt: null }, now)).toBe(false);
  });
  it('expirée → inutilisable', () => {
    expect(isKeyUsable({ revokedAt: null, expiresAt: new Date('2026-06-07') }, now)).toBe(false);
  });
  it('active / expiration future → utilisable', () => {
    expect(isKeyUsable({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(isKeyUsable({ revokedAt: null, expiresAt: new Date('2027-01-01') }, now)).toBe(true);
  });
});

describe('MCP auth — verifyApiKey (TOTAL, ne throw jamais)', () => {
  const valid = { id: 'k1', userId: 'u1', scopes: 'orders:write', revokedAt: null, expiresAt: null, lastUsedAt: null, user: { role: 'USER' } };

  it('préfixe invalide → null SANS toucher la DB', async () => {
    expect(await verifyApiKey('not-a-plio-key')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('clé inconnue → null', async () => {
    findUnique.mockResolvedValue(null);
    expect(await verifyApiKey('plio_sk_live_xxx')).toBeNull();
  });
  it('révoquée / expirée → null', async () => {
    findUnique.mockResolvedValue({ ...valid, revokedAt: new Date() });
    expect(await verifyApiKey('plio_sk_live_xxx')).toBeNull();
    findUnique.mockResolvedValue({ ...valid, expiresAt: new Date('2000-01-01') });
    expect(await verifyApiKey('plio_sk_live_xxx')).toBeNull();
  });
  it('valide → contexte + maj lastUsedAt (throttle : stale)', async () => {
    findUnique.mockResolvedValue(valid);
    const v = await verifyApiKey('plio_sk_live_xxx');
    expect(v).toEqual({ userId: 'u1', keyId: 'k1', scopes: ['orders:write'], role: 'USER' });
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('throttle : lastUsedAt récent → PAS de maj', async () => {
    findUnique.mockResolvedValue({ ...valid, lastUsedAt: new Date() });
    await verifyApiKey('plio_sk_live_xxx');
    expect(update).not.toHaveBeenCalled();
  });
  it('CRITIQUE : findUnique throw → null (jamais throw → pas de 401 global)', async () => {
    findUnique.mockRejectedValue(new Error('Neon cold start'));
    await expect(verifyApiKey('plio_sk_live_xxx')).resolves.toBeNull();
  });
  it('update qui throw ne fait PAS échouer l\'auth', async () => {
    findUnique.mockResolvedValue(valid);
    update.mockRejectedValue(new Error('write fail'));
    const v = await verifyApiKey('plio_sk_live_xxx');
    expect(v?.userId).toBe('u1');
  });
});

describe('MCP auth — gardes requireUser / requireScope', () => {
  const authed = { authInfo: { scopes: ['orders:write'], extra: { userId: 'u1', keyId: 'k1', role: 'USER' } } };

  it('requireUser : pas d\'authInfo → erreur MCP', () => {
    const r = requireUser({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.isError).toBe(true);
  });
  it('requireUser : authentifié → identité', () => {
    const r = requireUser(authed);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userId).toBe('u1');
  });
  it('requireScope : scope manquant → refus (une clé "lecture" ne commande pas)', () => {
    const readOnly = { authInfo: { scopes: ['catalog:read'], extra: { userId: 'u1', keyId: 'k1', role: 'USER' } } };
    const r = requireScope(readOnly, 'orders:write');
    expect(r.ok).toBe(false);
  });
  it('requireScope : scope présent → ok', () => {
    const r = requireScope(authed, 'orders:write');
    expect(r.ok).toBe(true);
  });
});

describe('MCP auth — mcpVerifyToken (AuthInfo sans secret en clair)', () => {
  it('pas de bearer → undefined (anonyme, read-only OK)', async () => {
    expect(await mcpVerifyToken(new Request('http://x'), undefined)).toBeUndefined();
  });
  it('clé valide → AuthInfo, token = keyId (PAS le secret), scopes tableau', async () => {
    findUnique.mockResolvedValue({ id: 'k1', userId: 'u1', scopes: 'orders:write', revokedAt: null, expiresAt: null, lastUsedAt: null, user: { role: 'USER' } });
    const info = await mcpVerifyToken(new Request('http://x'), 'plio_sk_live_secret');
    expect(info?.token).toBe('k1');
    expect(info?.token).not.toContain('plio_sk_'); // jamais le secret
    expect(info?.clientId).toBe('u1');
    expect(Array.isArray(info?.scopes)).toBe(true);
    expect(info?.extra?.userId).toBe('u1');
  });
  it('clé inconnue → undefined (anonyme, pas de 401)', async () => {
    findUnique.mockResolvedValue(null);
    expect(await mcpVerifyToken(new Request('http://x'), 'plio_sk_live_bad')).toBeUndefined();
  });
});
