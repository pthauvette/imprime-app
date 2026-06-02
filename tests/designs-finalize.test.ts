/**
 * POST /api/designs/finalize — reprise de brouillon (Round 2 #4).
 *
 * Vérifie la logique ajoutée : un `draftId` repris met à JOUR le draft existant
 * (pas de doublon), MAIS seulement s'il appartient à l'user (updateMany filtré
 * par userId). Un draftId d'un autre user ne matche rien → on crée un nouveau
 * draft (jamais de mutation cross-user). Sans draftId → création classique.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/lib/templates/render', () => ({
  renderTemplateToPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])), // "%PDF"
}));
vi.mock('@/lib/templates/registry', () => ({ getTemplateBySlug: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { upsert: vi.fn(async () => ({ id: 'u_guest' })) },
    template: { upsert: vi.fn(async () => ({ id: 'tpl_db_1' })) },
    designDraft: { updateMany: vi.fn(), create: vi.fn() },
  },
}));

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getTemplateBySlug } from '@/lib/templates/registry';

const TEMPLATE = {
  slug: 'carte-classic',
  name: 'Classic',
  description: 'desc',
  productType: 'business-card',
  variant: '3.5x2',
  side: 'double',
  pdfme: { schemas: [] },
  sampleValues: {},
  defaultSinalite: { productId: 42 },
};

async function importRoute() {
  vi.resetModules();
  return (await import('@/app/api/designs/finalize/route')).POST;
}

function postReq(body: unknown) {
  return new Request('http://localhost/api/designs/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTemplateBySlug).mockReturnValue(TEMPLATE as never);
});

describe('POST /api/designs/finalize — reprise de brouillon', () => {
  it('draftId possédé → UPDATE le draft existant, aucun create, renvoie le même designId', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u_owner' } } as never);
    vi.mocked(prisma.designDraft.updateMany).mockResolvedValueOnce({ count: 1 } as never);

    const POST = await importRoute();
    const res = await POST(postReq({ templateSlug: 'carte-classic', values: { name: 'X' }, draftId: 'd_existing' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.designId).toBe('d_existing');
    // update scopé à l'user + non commandé
    expect(prisma.designDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd_existing', userId: 'u_owner', orderId: null } }),
    );
    expect(prisma.designDraft.create).not.toHaveBeenCalled();
  });

  it('draftId d’un AUTRE user → updateMany ne matche rien → on crée un nouveau draft (pas de mutation cross-user)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u_attacker' } } as never);
    vi.mocked(prisma.designDraft.updateMany).mockResolvedValueOnce({ count: 0 } as never);
    vi.mocked(prisma.designDraft.create).mockResolvedValueOnce({ id: 'd_new' } as never);

    const POST = await importRoute();
    const res = await POST(postReq({ templateSlug: 'carte-classic', values: { name: 'Y' }, draftId: 'd_victim' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.designId).toBe('d_new');
    expect(prisma.designDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd_victim', userId: 'u_attacker', orderId: null } }),
    );
    expect(prisma.designDraft.create).toHaveBeenCalledTimes(1);
  });

  it('sans draftId → création classique, updateMany jamais appelé', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u_owner' } } as never);
    vi.mocked(prisma.designDraft.create).mockResolvedValueOnce({ id: 'd_fresh' } as never);

    const POST = await importRoute();
    const res = await POST(postReq({ templateSlug: 'carte-classic', values: { name: 'Z' } }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.designId).toBe('d_fresh');
    expect(prisma.designDraft.updateMany).not.toHaveBeenCalled();
    expect(prisma.designDraft.create).toHaveBeenCalledTimes(1);
  });
});
