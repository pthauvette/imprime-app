/**
 * Tests pour POST /api/order/send-continue-link — finding [74].
 *
 * Lock-in :
 *   - envoie le courriel avec l'URL exacte APP_URL+path
 *   - `path` DOIT commencer par "/order/" — tout le reste est rejeté (400)
 *   - `path` ne peut PAS contenir de guillemets/chevrons (casseraient
 *     l'attribut href du template, non échappé)
 *   - rate-limit PAR IP ET PAR EMAIL (email lowercased pour la clé)
 *   - email invalide → 400, AUCUN envoi
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

vi.mock('@/lib/emails/send', () => ({
  sendContinueOnDeviceEmail: vi.fn(async () => ({ sent: true, id: 'del_1' })),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/ratelimit';
import { sendContinueOnDeviceEmail } from '@/lib/emails/send';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true } as never);
});

async function importRoute() {
  vi.resetModules();
  return (await import('@/app/api/order/send-continue-link/route')).POST;
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/order/send-continue-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/order/send-continue-link', () => {
  it('envoie le courriel avec continueUrl = APP_URL + path exact', async () => {
    const POST = await importRoute();
    const res = await POST(
      makeReq({ email: 'sophie@studio.ca', path: '/order/upload?productId=7&options=12,34' }),
    );
    expect(res.status).toBe(200);
    expect(sendContinueOnDeviceEmail).toHaveBeenCalledTimes(1);
    const args = vi.mocked(sendContinueOnDeviceEmail).mock.calls[0][0];
    expect(args.to).toBe('sophie@studio.ca');
    expect(args.continueUrl).toContain('/order/upload?productId=7&options=12,34');
  });

  it('email lowercase normalisé avant envoi + rate-limit', async () => {
    const POST = await importRoute();
    await POST(makeReq({ email: 'Sophie@Studio.CA', path: '/order/upload?productId=7' }));
    const args = vi.mocked(sendContinueOnDeviceEmail).mock.calls[0][0];
    expect(args.to).toBe('sophie@studio.ca');
    expect(rateLimit).toHaveBeenCalledWith('continueLink', 'sophie@studio.ca');
  });

  it('400 si email invalide, aucun envoi', async () => {
    const POST = await importRoute();
    const res = await POST(makeReq({ email: 'not-an-email', path: '/order/upload?productId=7' }));
    expect(res.status).toBe(400);
    expect(sendContinueOnDeviceEmail).not.toHaveBeenCalled();
  });

  it.each([
    'https://evil.example/order/upload', // scheme + host devant /order/
    '//evil.example/order/upload', // protocol-relative
    '/configure?productId=7', // ne commence pas par /order/
    '/order/upload"><script>alert(1)</script>', // casse l\'attribut href
    "/order/upload?x='onerror=alert(1)", // guillemet simple
    '/order/upload?x=<b>hi</b>', // chevrons
  ])('400 si path dangereux ou hors périmètre : %s', async (path) => {
    const POST = await importRoute();
    const res = await POST(makeReq({ email: 'a@b.ca', path }));
    expect(res.status).toBe(400);
    expect(sendContinueOnDeviceEmail).not.toHaveBeenCalled();
  });

  it('rate-limit IP dépassé → 429, AUCUN envoi', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ code: 'RATE_LIMITED' }, { status: 429 }),
    } as never);

    const POST = await importRoute();
    const res = await POST(makeReq({ email: 'a@b.ca', path: '/order/upload?productId=7' }));
    expect(res.status).toBe(429);
    expect(sendContinueOnDeviceEmail).not.toHaveBeenCalled();
  });

  it('rate-limit EMAIL dépassé (IP ok) → 429, AUCUN envoi', async () => {
    vi.mocked(rateLimit)
      .mockResolvedValueOnce({ ok: true } as never) // IP passe
      .mockResolvedValueOnce({
        ok: false,
        response: NextResponse.json({ code: 'RATE_LIMITED' }, { status: 429 }),
      } as never); // email bloqué

    const POST = await importRoute();
    const res = await POST(makeReq({ email: 'victim@x.ca', path: '/order/upload?productId=7' }));
    expect(res.status).toBe(429);
    expect(sendContinueOnDeviceEmail).not.toHaveBeenCalled();
  });
});
