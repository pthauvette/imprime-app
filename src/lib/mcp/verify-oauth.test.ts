import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPair, SignJWT, type CryptoKey, type JWTVerifyGetKey } from 'jose';

const { findOrCreateUserByEmail } = vi.hoisted(() => ({ findOrCreateUserByEmail: vi.fn() }));
vi.mock('@/lib/db/orders', () => ({ findOrCreateUserByEmail }));

import { verifyOAuthBearer } from './verify-oauth';

const RESOURCE = 'https://www.plio.ca/api/mcp';
let publicKey: CryptoKey;
let privateKey: CryptoKey;

/** Enveloppe une clé locale en resolver (même type JWTVerifyGetKey que le JWKS distant). */
const resolver = (k: CryptoKey): JWTVerifyGetKey => async () => k;

async function sign(
  claims: Record<string, unknown> = {},
  opts: { aud?: string; iss?: string; expSecondsFromNow?: number } = {},
): Promise<string> {
  const jwt = new SignJWT({ email: 'agent@client.ca', email_verified: true, scope: 'catalog:read orders:write', ...claims })
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject('workos_user_abc')
    .setIssuedAt()
    .setAudience(opts.aud ?? RESOURCE)
    .setExpirationTime(Math.floor(Date.now() / 1000) + (opts.expSecondsFromNow ?? 3600));
  if (opts.iss) jwt.setIssuer(opts.iss);
  return jwt.sign(privateKey);
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('MCP_RESOURCE_URI', RESOURCE);
  vi.stubEnv('MCP_OAUTH_EXPECTED_ISSUER', '');
  ({ publicKey, privateKey } = await generateKeyPair('ES256'));
  findOrCreateUserByEmail.mockResolvedValue({ id: 'user_1', email: 'agent@client.ca' });
});
afterEach(() => vi.unstubAllEnvs());

describe('verifyOAuthBearer — happy path', () => {
  it('token valide → identité (userId, scopes, role USER, subject)', async () => {
    const r = await verifyOAuthBearer(await sign(), resolver(publicKey));
    expect(r).toEqual({ userId: 'user_1', scopes: ['catalog:read', 'orders:write'], role: 'USER', subject: 'workos_user_abc' });
    expect(findOrCreateUserByEmail).toHaveBeenCalledWith({ email: 'agent@client.ca' });
  });
});

describe('H2 — audience binding (anti token-confusion)', () => {
  it('aud d\'un AUTRE resource server → null', async () => {
    const r = await verifyOAuthBearer(await sign({}, { aud: 'https://evil.example/api/mcp' }), resolver(publicKey));
    expect(r).toBeNull();
    expect(findOrCreateUserByEmail).not.toHaveBeenCalled();
  });
});

describe('exp / iss', () => {
  it('token expiré → null', async () => {
    const r = await verifyOAuthBearer(await sign({}, { expSecondsFromNow: -10 }), resolver(publicKey));
    expect(r).toBeNull();
  });
  it('issuer attendu configuré + token d\'un autre issuer → null', async () => {
    vi.stubEnv('MCP_OAUTH_EXPECTED_ISSUER', 'https://plio.authkit.app');
    const r = await verifyOAuthBearer(await sign({}, { iss: 'https://evil.example' }), resolver(publicKey));
    expect(r).toBeNull();
  });
});

describe('M2 — identité anti-account-takeover', () => {
  it('email non vérifié → null (jamais de lien JIT)', async () => {
    const r = await verifyOAuthBearer(await sign({ email_verified: false }), resolver(publicKey));
    expect(r).toBeNull();
    expect(findOrCreateUserByEmail).not.toHaveBeenCalled();
  });
  it('email absent → null', async () => {
    const r = await verifyOAuthBearer(await sign({ email: undefined }), resolver(publicKey));
    expect(r).toBeNull();
  });
  it('scope orders:write:headless demandé → JAMAIS octroyé (filtré)', async () => {
    const r = await verifyOAuthBearer(await sign({ scope: 'catalog:read orders:write:headless' }), resolver(publicKey));
    expect(r).not.toBeNull();
    expect(r!.scopes).toEqual(['catalog:read']); // headless retiré
    expect(r!.scopes).not.toContain('orders:write:headless');
  });
  it('role toujours USER même si le claim tente ADMIN', async () => {
    const r = await verifyOAuthBearer(await sign({ role: 'ADMIN' }), resolver(publicKey));
    expect(r!.role).toBe('USER');
  });
});

describe('H1 — TOTAL (ne throw JAMAIS)', () => {
  it('résolveur de clé qui throw (JWKS down) → null, pas d\'exception', async () => {
    const throwingKey: JWTVerifyGetKey = async () => { throw new Error('JWKS unreachable'); };
    await expect(verifyOAuthBearer(await sign(), throwingKey)).resolves.toBeNull();
  });
  it('token corrompu → null', async () => {
    await expect(verifyOAuthBearer('not.a.jwt', resolver(publicKey))).resolves.toBeNull();
  });
  it('signé par une AUTRE clé → null', async () => {
    const other = await generateKeyPair('ES256');
    const token = await new SignJWT({ email: 'x@y.ca', email_verified: true, scope: 'catalog:read' })
      .setProtectedHeader({ alg: 'ES256' }).setAudience(RESOURCE).setExpirationTime('1h').sign(other.privateKey);
    await expect(verifyOAuthBearer(token, resolver(publicKey))).resolves.toBeNull();
  });
});
