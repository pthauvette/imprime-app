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
// Audit v2 #6.3 — rate-limit ; par défaut on laisse passer.
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));
// Cloisonnement invité (P1-5) : le jeton vit dans un cookie httpOnly.
const cookieStore = { get: vi.fn(() => undefined as { value: string } | undefined) };
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getTemplateBySlug } from '@/lib/templates/registry';
import { renderTemplateToPdf } from '@/lib/templates/render';
import { rateLimit } from '@/lib/ratelimit';

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
  cookieStore.get.mockReturnValue(undefined);
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

  // Audit v2 #6.3 — rate-limit avant tout render/write coûteux.
  it('#6.3 — rate-limited → 429, AUCUN render ni write DB', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ code: 'RATE_LIMITED' }, { status: 429 }),
    } as never);

    const POST = await importRoute();
    const res = await POST(postReq({ templateSlug: 'carte-classic', values: { name: 'X' } }));

    expect(res.status).toBe(429);
    expect(renderTemplateToPdf).not.toHaveBeenCalled();
    expect(prisma.designDraft.create).not.toHaveBeenCalled();
    expect(prisma.designDraft.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * P1-5 (audit pré-lancement 2026-07) — cloisonnement des INVITÉS.
 *
 * Tous les visiteurs non connectés partagent la row `guest@plio.local`, donc le
 * même `userId`. Le filtre `userId` du bloc ci-dessus les protège des comptes
 * réels mais PAS les uns des autres : sans 2e clé, l'invité B pouvait écraser le
 * design de l'invité A en devinant/fuitant son draftId. Ces tests verrouillent
 * le jeton de navigateur qui ferme ce trou.
 */
describe('POST /api/designs/finalize — cloisonnement des invités', () => {
  it('invité SANS cookie → jeton tiré, stocké sur le draft ET posé en cookie httpOnly', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.designDraft.create).mockResolvedValueOnce({ id: 'd_g1' } as never);

    const POST = await importRoute();
    const res = await POST(postReq({ templateSlug: 'carte-classic', values: { name: 'A' } }));

    expect(res.status).toBe(200);
    const data = vi.mocked(prisma.designDraft.create).mock.calls[0][0].data as { guestToken: string };
    expect(data.guestToken).toEqual(expect.any(String));
    expect(data.guestToken.length).toBeGreaterThanOrEqual(32);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('plio_guest=');
    expect(setCookie.toLowerCase()).toContain('httponly');
  });

  it('deux invités successifs reçoivent des jetons DIFFÉRENTS (pas de valeur fixe)', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    vi.mocked(prisma.designDraft.create).mockResolvedValue({ id: 'd_x' } as never);

    const POST = await importRoute();
    await POST(postReq({ templateSlug: 'carte-classic', values: { name: 'A' } }));
    await POST(postReq({ templateSlug: 'carte-classic', values: { name: 'B' } }));

    const calls = vi.mocked(prisma.designDraft.create).mock.calls;
    const t1 = (calls[0][0].data as { guestToken: string }).guestToken;
    const t2 = (calls[1][0].data as { guestToken: string }).guestToken;
    expect(t1).not.toBe(t2);
  });

  it("ATTAQUE — l'invité B reprenant le draftId de A filtre sur SON jeton, donc ne l'écrase pas", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    cookieStore.get.mockReturnValue({ value: 'jeton-de-B' });
    // Le draft de A porte 'jeton-de-A' → la clause ne matche rien.
    vi.mocked(prisma.designDraft.updateMany).mockResolvedValueOnce({ count: 0 } as never);
    vi.mocked(prisma.designDraft.create).mockResolvedValueOnce({ id: 'd_neuf' } as never);

    const POST = await importRoute();
    const res = await POST(postReq({ templateSlug: 'carte-classic', values: { name: 'PWN' }, draftId: 'd_de_A' }));

    expect((await res.json()).designId).toBe('d_neuf');
    expect(prisma.designDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'd_de_A', userId: 'u_guest', orderId: null, guestToken: 'jeton-de-B' },
      }),
    );
    // Le design de A est intact : B a créé le sien au lieu de muter celui d'autrui.
    expect(prisma.designDraft.create).toHaveBeenCalledTimes(1);
  });

  it('invité AVEC cookie reprenant SON draft → update, et le cookie n’est pas re-posé', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    cookieStore.get.mockReturnValue({ value: 'jeton-de-A' });
    vi.mocked(prisma.designDraft.updateMany).mockResolvedValueOnce({ count: 1 } as never);

    const POST = await importRoute();
    const res = await POST(postReq({ templateSlug: 'carte-classic', values: { name: 'A2' }, draftId: 'd_de_A' }));

    expect((await res.json()).designId).toBe('d_de_A');
    expect(prisma.designDraft.create).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('user CONNECTÉ → guestToken null et aucune clause guestToken (le userId cloisonne déjà)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u_reel' } } as never);
    vi.mocked(prisma.designDraft.create).mockResolvedValueOnce({ id: 'd_reel' } as never);

    const POST = await importRoute();
    const res = await POST(postReq({ templateSlug: 'carte-classic', values: { name: 'R' } }));

    expect((await res.json()).designId).toBe('d_reel');
    expect((vi.mocked(prisma.designDraft.create).mock.calls[0][0].data as { guestToken: unknown }).guestToken).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
