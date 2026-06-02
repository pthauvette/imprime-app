/**
 * Régression sécurité (Round 1 audit) — GET /api/designs/[id]/pdf.
 *
 * Avant : aucune auth (« optional pour MVP ») → IDOR, tout id servait le PDF
 * print-ready d'un autre client. Désormais : auth + ownership (ou ADMIN),
 * 404 silencieux sinon.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/lib/db', () => ({
  prisma: { designDraft: { findUnique: vi.fn() } },
}));

import { auth } from '@/auth';
import { prisma } from '@/lib/db';

const PDF_DATA_URL = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 test').toString('base64');

async function importRoute() {
  vi.resetModules();
  return (await import('@/app/api/designs/[id]/pdf/route')).GET;
}
const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request('http://localhost/api/designs/d1/pdf');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/designs/[id]/pdf — fix IDOR', () => {
  it('401 si pas de session (et ne touche même pas la DB)', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const GET = await importRoute();
    const res = await GET(req(), makeCtx('d1') as never);
    expect(res.status).toBe(401);
    expect(prisma.designDraft.findUnique).not.toHaveBeenCalled();
  });

  it('404 si connecté mais PAS propriétaire (ni admin) — pas de leak d’existence', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u_other', role: 'USER' } } as never);
    vi.mocked(prisma.designDraft.findUnique).mockResolvedValueOnce({ userId: 'u_owner', finalPdfUrl: PDF_DATA_URL } as never);
    const GET = await importRoute();
    const res = await GET(req(), makeCtx('d1') as never);
    expect(res.status).toBe(404);
  });

  it('200 + application/pdf pour le propriétaire', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u_owner', role: 'USER' } } as never);
    vi.mocked(prisma.designDraft.findUnique).mockResolvedValueOnce({ userId: 'u_owner', finalPdfUrl: PDF_DATA_URL } as never);
    const GET = await importRoute();
    const res = await GET(req(), makeCtx('d1') as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  it('200 pour un ADMIN même non-propriétaire', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u_admin', role: 'ADMIN' } } as never);
    vi.mocked(prisma.designDraft.findUnique).mockResolvedValueOnce({ userId: 'u_owner', finalPdfUrl: PDF_DATA_URL } as never);
    const GET = await importRoute();
    const res = await GET(req(), makeCtx('d1') as never);
    expect(res.status).toBe(200);
  });

  it('404 si draft introuvable', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', role: 'USER' } } as never);
    vi.mocked(prisma.designDraft.findUnique).mockResolvedValueOnce(null as never);
    const GET = await importRoute();
    const res = await GET(req(), makeCtx('d1') as never);
    expect(res.status).toBe(404);
  });
});
