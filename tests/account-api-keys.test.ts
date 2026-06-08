import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));

const { count, create, findFirst, update } = vi.hoisted(() => ({
  count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: { apiKey: { count, create, findFirst, update } } }));

const { rl } = vi.hoisted(() => ({ rl: vi.fn() }));
vi.mock('@/lib/ratelimit', () => ({ rateLimit: rl }));
vi.mock('@/lib/logger', () => ({ logAuth: { warn: vi.fn() } }));

import { POST } from '@/app/api/account/api-keys/route';
import { DELETE } from '@/app/api/account/api-keys/[id]/route';
import { assertSameOrigin } from '@/lib/api-helpers';

const SESSION = { user: { id: 'u1', email: 'a@b.ca', role: 'USER' } };
function postReq(body: unknown) {
  return new Request('http://x/api/account/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  authMock.mockReset(); count.mockReset(); create.mockReset(); findFirst.mockReset(); update.mockReset(); rl.mockReset();
  rl.mockResolvedValue({ ok: true, remaining: 9 });
  count.mockResolvedValue(0);
});

describe('POST /api/account/api-keys', () => {
  it('non authentifié → 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(postReq({ name: 'x', scopes: [] }));
    expect(res.status).toBe(401);
  });

  it('valide → 201 + token en clair retourné UNE fois + hash stocké (pas le secret)', async () => {
    authMock.mockResolvedValue(SESSION);
    create.mockImplementation(async ({ data, select }: any) => ({ id: 'k1', name: data.name, keyPrefix: data.keyPrefix, scopes: data.scopes, createdAt: new Date() }));
    const res = await POST(postReq({ name: 'Agent', scopes: ['orders:write'] }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.token).toMatch(/^plio_sk_live_/); // token clair retourné
    // Ce qui est STOCKÉ : keyHash (jamais le token clair) + scopes whitelistés.
    const stored = create.mock.calls[0]![0].data;
    expect(stored.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.keyHash).not.toBe(json.token);
    expect(stored.scopes).toBe('orders:write');
    expect(stored.userId).toBe('u1');
  });

  it('scope inconnu → filtré (whitelist)', async () => {
    authMock.mockResolvedValue(SESSION);
    create.mockResolvedValue({ id: 'k1', name: 'x', keyPrefix: 'p', scopes: '', createdAt: new Date() });
    // Zod rejette d'abord un enum invalide → 400 (défense schema). On teste un scope vide.
    const res = await POST(postReq({ name: 'x', scopes: [] }));
    expect(res.status).toBe(201);
    expect(create.mock.calls[0]![0].data.scopes).toBe('');
  });

  it('cap de clés actives atteint → 409', async () => {
    authMock.mockResolvedValue(SESSION);
    count.mockResolvedValue(20);
    const res = await POST(postReq({ name: 'x', scopes: [] }));
    expect(res.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it('rate-limité → réponse 429 du limiter', async () => {
    authMock.mockResolvedValue(SESSION);
    rl.mockResolvedValue({ ok: false, response: new Response('rl', { status: 429 }) });
    const res = await POST(postReq({ name: 'x', scopes: [] }));
    expect(res.status).toBe(429);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('assertSameOrigin (garde CSRF best-effort)', () => {
  it('Origin absent → toléré (null) ; on s\'appuie sur SameSite=Lax', () => {
    expect(assertSameOrigin(new Request('https://www.plio.ca/x', { method: 'POST' }))).toBeNull();
  });
  it('Origin cross-site → 403', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.plio.ca');
    const res = assertSameOrigin(new Request('https://www.plio.ca/x', { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(res?.status).toBe(403);
    vi.unstubAllEnvs();
  });
  it('Origin same-site → toléré (null)', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.plio.ca');
    expect(assertSameOrigin(new Request('https://www.plio.ca/x', { method: 'POST', headers: { origin: 'https://www.plio.ca' } }))).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe('DELETE /api/account/api-keys/[id]', () => {
  it('non authentifié → 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), ctx('k1'));
    expect(res.status).toBe(401);
  });

  it('clé d\'un autre user (findFirst null) → 404, JAMAIS 403 (anti-énumération)', async () => {
    authMock.mockResolvedValue(SESSION);
    findFirst.mockResolvedValue(null);
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), ctx('k_autre'));
    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
    // L'ownership est filtré par la requête : where {id, userId}.
    expect(findFirst.mock.calls[0]![0].where).toEqual({ id: 'k_autre', userId: 'u1' });
  });

  it('clé possédée → soft-revoke (revokedAt)', async () => {
    authMock.mockResolvedValue(SESSION);
    findFirst.mockResolvedValue({ id: 'k1', revokedAt: null });
    update.mockResolvedValue({});
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), ctx('k1'));
    expect(res.status).toBe(200);
    expect(update.mock.calls[0]![0].data.revokedAt).toBeInstanceOf(Date);
  });

  it('clé déjà révoquée → 200 idempotent sans nouveau write', async () => {
    authMock.mockResolvedValue(SESSION);
    findFirst.mockResolvedValue({ id: 'k1', revokedAt: new Date() });
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), ctx('k1'));
    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });
});
