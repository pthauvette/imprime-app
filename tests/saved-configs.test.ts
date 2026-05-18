/**
 * Tests pour /api/saved-configs (GET + POST) et /[id] (PUT + DELETE + POST).
 *
 * Focus :
 *  - Auth guard (401 si pas connecté)
 *  - Dedup : sauver 2× même combo (canonicalized) ne crée pas de doublon
 *  - Ownership : un user ne peut pas DELETE/POST une config qui n'est pas
 *    la sienne → 404 (oracle protection)
 *  - URL deep-link bien formée
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    savedConfig: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'user_alice', email: 'alice@plio.ca' } })),
}));

import { prisma } from '@/lib/db';
import { auth } from '@/auth';

function jsonReq(body: unknown, method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Request {
  return new Request('http://localhost/x', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: 'user_alice', email: 'alice@plio.ca' } } as never);
  vi.mocked(prisma.savedConfig.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.savedConfig.create).mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'cfg_new', ...data, createdAt: new Date(), updatedAt: new Date(),
  })) as never);
});

describe('POST /api/saved-configs', () => {
  const baseBody = {
    name: 'Mes cartes 14pt',
    productId: 137,
    productName: 'Cartes 14pt UV',
    optionIds: [4, 30, 107, 224, 78],
    summary: '500 unités · Standard',
  };

  it('401 si pas connecté', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const { POST } = await import('@/app/api/saved-configs/route');
    const res = await POST(jsonReq(baseBody));
    expect(res.status).toBe(401);
    expect(prisma.savedConfig.create).not.toHaveBeenCalled();
  });

  it('crée une config avec optionIds sortés en JSON', async () => {
    const { POST } = await import('@/app/api/saved-configs/route');
    const res = await POST(jsonReq(baseBody));
    expect(res.status).toBe(200);
    const args = vi.mocked(prisma.savedConfig.create).mock.calls[0][0];
    expect(args.data).toMatchObject({
      userId: 'user_alice',
      name: 'Mes cartes 14pt',
      productId: 137,
      productName: 'Cartes 14pt UV',
      optionIds: '[4,30,78,107,224]', // sorted ascending
      summary: '500 unités · Standard',
    });
  });

  it('déduplique si même combo déjà sauvegardé', async () => {
    vi.mocked(prisma.savedConfig.findFirst).mockResolvedValueOnce({
      id: 'cfg_existing', name: 'Original', userId: 'user_alice',
    } as never);
    const { POST } = await import('@/app/api/saved-configs/route');
    const res = await POST(jsonReq(baseBody));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.duplicate).toBe(true);
    expect(j.config.id).toBe('cfg_existing');
    expect(prisma.savedConfig.create).not.toHaveBeenCalled();
  });

  it('refuse name vide — 400', async () => {
    const { POST } = await import('@/app/api/saved-configs/route');
    const res = await POST(jsonReq({ ...baseBody, name: '' }));
    expect(res.status).toBe(400);
  });

  it('refuse optionIds vide — 400', async () => {
    const { POST } = await import('@/app/api/saved-configs/route');
    const res = await POST(jsonReq({ ...baseBody, optionIds: [] }));
    expect(res.status).toBe(400);
  });

  it('refuse productId non positif — 400', async () => {
    const { POST } = await import('@/app/api/saved-configs/route');
    const res = await POST(jsonReq({ ...baseBody, productId: -1 }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/saved-configs', () => {
  it('401 si pas connecté', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const { GET } = await import('@/app/api/saved-configs/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('retourne la liste filtrée par userId', async () => {
    vi.mocked(prisma.savedConfig.findMany).mockResolvedValueOnce([
      { id: 'cfg_1', name: 'A' }, { id: 'cfg_2', name: 'B' },
    ] as never);
    const { GET } = await import('@/app/api/saved-configs/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.configs).toHaveLength(2);
    expect(vi.mocked(prisma.savedConfig.findMany).mock.calls[0][0]).toMatchObject({
      where: { userId: 'user_alice' },
      take: 50,
    });
  });
});

describe('DELETE /api/saved-configs/[id]', () => {
  it('401 si pas connecté', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const { DELETE } = await import('@/app/api/saved-configs/[id]/route');
    const res = await DELETE(jsonReq({}, 'DELETE'), { params: Promise.resolve({ id: 'cfg_1' }) });
    expect(res.status).toBe(401);
  });

  it('404 si config existe pas (ou pas owner)', async () => {
    vi.mocked(prisma.savedConfig.findFirst).mockResolvedValueOnce(null);
    const { DELETE } = await import('@/app/api/saved-configs/[id]/route');
    const res = await DELETE(jsonReq({}, 'DELETE'), { params: Promise.resolve({ id: 'cfg_bad' }) });
    expect(res.status).toBe(404);
    expect(prisma.savedConfig.delete).not.toHaveBeenCalled();
  });

  it('supprime si owner', async () => {
    vi.mocked(prisma.savedConfig.findFirst).mockResolvedValueOnce({
      id: 'cfg_1', userId: 'user_alice',
    } as never);
    const { DELETE } = await import('@/app/api/saved-configs/[id]/route');
    const res = await DELETE(jsonReq({}, 'DELETE'), { params: Promise.resolve({ id: 'cfg_1' }) });
    expect(res.status).toBe(200);
    expect(prisma.savedConfig.delete).toHaveBeenCalledWith({ where: { id: 'cfg_1' } });
  });
});

describe('POST /api/saved-configs/[id] (use + deep-link)', () => {
  it('retourne URL deep-link bien formée + bump usage', async () => {
    vi.mocked(prisma.savedConfig.findFirst).mockResolvedValueOnce({
      id: 'cfg_1', userId: 'user_alice', productId: 137,
      optionIds: '[4,30,78,107,224]',
    } as never);
    vi.mocked(prisma.savedConfig.update).mockResolvedValueOnce({
      id: 'cfg_1', userId: 'user_alice', productId: 137,
      optionIds: '[4,30,78,107,224]', lastUsedAt: new Date(), timesUsed: 1,
    } as never);

    const { POST } = await import('@/app/api/saved-configs/[id]/route');
    const res = await POST(jsonReq({}), { params: Promise.resolve({ id: 'cfg_1' }) });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.url).toBe('/order/configure?productId=137&options=4,30,78,107,224');
    expect(vi.mocked(prisma.savedConfig.update).mock.calls[0][0]).toMatchObject({
      where: { id: 'cfg_1' },
      data: { timesUsed: { increment: 1 } },
    });
  });

  it('fallback URL si optionIds corrupted (pas de throw)', async () => {
    vi.mocked(prisma.savedConfig.findFirst).mockResolvedValueOnce({
      id: 'cfg_1', userId: 'user_alice', productId: 137, optionIds: 'not-json',
    } as never);
    vi.mocked(prisma.savedConfig.update).mockResolvedValueOnce({
      id: 'cfg_1', userId: 'user_alice', productId: 137, optionIds: 'not-json',
    } as never);

    const { POST } = await import('@/app/api/saved-configs/[id]/route');
    const res = await POST(jsonReq({}), { params: Promise.resolve({ id: 'cfg_1' }) });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.url).toBe('/order/configure?productId=137&options=');
  });

  it('404 si pas owner', async () => {
    vi.mocked(prisma.savedConfig.findFirst).mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/saved-configs/[id]/route');
    const res = await POST(jsonReq({}), { params: Promise.resolve({ id: 'cfg_other' }) });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/saved-configs/[id] (rename)', () => {
  it('renomme si owner', async () => {
    vi.mocked(prisma.savedConfig.findFirst).mockResolvedValueOnce({
      id: 'cfg_1', userId: 'user_alice', name: 'Original',
    } as never);
    vi.mocked(prisma.savedConfig.update).mockResolvedValueOnce({
      id: 'cfg_1', name: 'Nouveau nom',
    } as never);
    const { PUT } = await import('@/app/api/saved-configs/[id]/route');
    const res = await PUT(jsonReq({ name: 'Nouveau nom' }, 'PUT'), { params: Promise.resolve({ id: 'cfg_1' }) });
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.savedConfig.update).mock.calls[0][0]).toMatchObject({
      where: { id: 'cfg_1' },
      data: { name: 'Nouveau nom' },
    });
  });

  it('refuse name vide — 400', async () => {
    vi.mocked(prisma.savedConfig.findFirst).mockResolvedValueOnce({
      id: 'cfg_1', userId: 'user_alice',
    } as never);
    const { PUT } = await import('@/app/api/saved-configs/[id]/route');
    const res = await PUT(jsonReq({ name: '' }, 'PUT'), { params: Promise.resolve({ id: 'cfg_1' }) });
    expect(res.status).toBe(400);
  });
});
