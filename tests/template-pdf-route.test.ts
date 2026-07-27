/**
 * Tests pour GET /api/templates/gabarit.pdf — finding [22]/[116]/[130].
 *
 * Route publique (pas d'auth, aucune donnée client) : couvre validation
 * zod des query params, rate limit, et le PDF réellement streamé.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { rateLimit } from '@/lib/ratelimit';

function makeReq(qs: string): Request {
  return new Request(`http://localhost/api/templates/gabarit.pdf${qs}`) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 10 } as never);
});

describe('GET /api/templates/gabarit.pdf', () => {
  it('génère un PDF valide avec w/h/bleed/safe fournis', async () => {
    const { GET } = await import('@/app/api/templates/gabarit.pdf/route');
    const res = await GET(makeReq('?w=3.5&h=2&bleed=0.125&safe=0.125&name=Cartes') as never);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('attachment');

    const buf = await res.arrayBuffer();
    const doc = await PDFDocument.load(new Uint8Array(buf));
    expect(doc.getPageCount()).toBe(1);
  });

  it('bleed/safe optionnels → défauts 0.125', async () => {
    const { GET } = await import('@/app/api/templates/gabarit.pdf/route');
    const res = await GET(makeReq('?w=4&h=6') as never);
    expect(res.status).toBe(200);
  });

  it('400 si w/h manquants', async () => {
    const { GET } = await import('@/app/api/templates/gabarit.pdf/route');
    const res = await GET(makeReq('?w=4') as never);
    expect(res.status).toBe(400);
  });

  it('400 si w hors bornes (taille pathologique, anti-abus)', async () => {
    const { GET } = await import('@/app/api/templates/gabarit.pdf/route');
    const res = await GET(makeReq('?w=99999&h=6') as never);
    expect(res.status).toBe(400);
  });

  it('429 si rate-limited', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429 }),
    } as never);
    const { GET } = await import('@/app/api/templates/gabarit.pdf/route');
    const res = await GET(makeReq('?w=3.5&h=2') as never);
    expect(res.status).toBe(429);
  });
});
