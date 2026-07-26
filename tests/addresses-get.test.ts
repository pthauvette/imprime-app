/**
 * GET /api/addresses — finding [34]/[53]/[126] : ce GET n'existait pas du
 * tout (seul POST). Verrouille : auth guard, filtre par kind+userId, ordre
 * (default d'abord).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    address: {
      findMany: vi.fn(async () => []),
    },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => null),
}));

import { prisma } from '@/lib/db';
import { auth } from '@/auth';

function req(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/addresses', () => {
  it('401 si pas connecté', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const { GET } = await import('@/app/api/addresses/route');
    const res = await GET(req('http://localhost/api/addresses'));
    expect(res.status).toBe(401);
    expect(prisma.address.findMany).not.toHaveBeenCalled();
  });

  it('filtre par userId de la session ET kind=SHIPPING par défaut, trie default en premier', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user_alice' } } as never);
    const { GET } = await import('@/app/api/addresses/route');
    await GET(req('http://localhost/api/addresses'));
    expect(prisma.address.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_alice', kind: 'SHIPPING' },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  });

  it('?kind=BILLING lit les adresses de facturation', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user_alice' } } as never);
    const { GET } = await import('@/app/api/addresses/route');
    await GET(req('http://localhost/api/addresses?kind=BILLING'));
    expect(prisma.address.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_alice', kind: 'BILLING' } }),
    );
  });

  it('un user ne voit jamais les adresses d\'un autre — filtre toujours sur SON userId', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user_bob' } } as never);
    const { GET } = await import('@/app/api/addresses/route');
    await GET(req('http://localhost/api/addresses'));
    const call = vi.mocked(prisma.address.findMany).mock.calls[0]![0] as { where: { userId: string } };
    expect(call.where.userId).toBe('user_bob');
  });
});
