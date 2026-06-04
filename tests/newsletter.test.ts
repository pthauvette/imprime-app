/**
 * Tests pour /api/newsletter/subscribe + /api/newsletter/unsubscribe.
 *
 * Couvre :
 *   - Subscribe idempotent (re-sub same email = OK)
 *   - Reactivate UNSUBSCRIBED → ACTIVE
 *   - Consent IP + UA captured (preuve CASL)
 *   - Rate limit
 *   - Unsubscribe avec token HMAC
 *   - Unsubscribe avec bad token = rejet
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    newsletterSubscriber: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    // Audit v2 #7.7 — le GET unsubscribe désabonne aussi User.emailMarketing.
    user: { updateMany: vi.fn(async () => ({ count: 1 })) },
  },
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

// Audit-vérif M2 — le GET unsubscribe enregistre une suppression (invités).
vi.mock('@/lib/emails/suppression', () => ({
  suppressEmail: vi.fn(async () => ({ created: true })),
}));

import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true } as never);
  vi.mocked(prisma.newsletterSubscriber.findUnique).mockResolvedValue(null);
});

describe('POST /api/newsletter/subscribe', () => {
  it('nouveau email : create avec IP + UA + source', async () => {
    vi.mocked(prisma.newsletterSubscriber.create).mockResolvedValueOnce({} as never);
    const { POST } = await import('@/app/api/newsletter/subscribe/route');
    const res = await POST(makeReq(
      { email: 'lead@example.ca', source: 'landing-footer' },
      { 'user-agent': 'Mozilla/5.0 test' },
    ));
    expect(res.status).toBe(200);
    expect(prisma.newsletterSubscriber.create).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.newsletterSubscriber.create).mock.calls[0][0];
    expect(args.data).toMatchObject({
      email: 'lead@example.ca',
      source: 'landing-footer',
      consentIp: '1.2.3.4',
      status: 'ACTIVE',
    });
    expect(args.data.consentUa).toContain('Mozilla');
  });

  it('idempotent si déjà ACTIVE — pas de create, return 200', async () => {
    vi.mocked(prisma.newsletterSubscriber.findUnique).mockResolvedValueOnce({
      email: 'lead@example.ca', status: 'ACTIVE',
    } as never);
    const { POST } = await import('@/app/api/newsletter/subscribe/route');
    const res = await POST(makeReq({ email: 'lead@example.ca' }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.alreadySubscribed).toBe(true);
    expect(prisma.newsletterSubscriber.create).not.toHaveBeenCalled();
  });

  it('reactive si email UNSUBSCRIBED précédemment', async () => {
    vi.mocked(prisma.newsletterSubscriber.findUnique).mockResolvedValueOnce({
      email: 'lead@example.ca', status: 'UNSUBSCRIBED', source: 'popup',
    } as never);
    vi.mocked(prisma.newsletterSubscriber.update).mockResolvedValueOnce({} as never);
    const { POST } = await import('@/app/api/newsletter/subscribe/route');
    const res = await POST(makeReq({ email: 'lead@example.ca', source: 'landing-footer' }));
    expect(res.status).toBe(200);
    expect(prisma.newsletterSubscriber.update).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.newsletterSubscriber.update).mock.calls[0][0];
    expect(args.data.status).toBe('ACTIVE');
    expect(args.data.unsubscribedAt).toBeNull();
  });

  it('email lowercased au stockage', async () => {
    vi.mocked(prisma.newsletterSubscriber.create).mockResolvedValueOnce({} as never);
    const { POST } = await import('@/app/api/newsletter/subscribe/route');
    await POST(makeReq({ email: 'LEAD@Example.CA' }));
    const args = vi.mocked(prisma.newsletterSubscriber.create).mock.calls[0][0];
    expect(args.data.email).toBe('lead@example.ca');
  });

  it('400 si email invalide', async () => {
    const { POST } = await import('@/app/api/newsletter/subscribe/route');
    const res = await POST(makeReq({ email: 'pas-un-email' }));
    expect(res.status).toBe(400);
    expect(prisma.newsletterSubscriber.create).not.toHaveBeenCalled();
  });

  it('rate-limited 429 si bucket dépassé', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: 'rate limit' }), { status: 429 }),
    } as never);
    const { POST } = await import('@/app/api/newsletter/subscribe/route');
    const res = await POST(makeReq({ email: 'lead@example.ca' }));
    expect(res.status).toBe(429);
  });
});

describe('GET /api/newsletter/unsubscribe', () => {
  it('token valid → marks UNSUBSCRIBED + render HTML confirm', async () => {
    const { GET } = await import('@/app/api/newsletter/unsubscribe/route');
    const { newsletterUnsubscribeToken } = await import('@/lib/newsletter/token');
    const email = 'lead@example.ca';
    const token = newsletterUnsubscribeToken(email);
    const req = new Request(`http://localhost/api/newsletter/unsubscribe?email=${email}&token=${token}`);
    // Cast pour NextRequest interface
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(prisma.newsletterSubscriber.updateMany).toHaveBeenCalledWith({
      where: { email, status: 'ACTIVE' },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: expect.any(Date) },
    });
    // Audit v2 #7.7 — désabonne aussi User.emailMarketing (broadcasts, reseller
    // stats, reengagement gardent sur ce flag).
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { email, emailMarketing: true },
      data: { emailMarketing: false },
    });
  });

  it('token invalid → 400 sans toucher la DB', async () => {
    const { GET } = await import('@/app/api/newsletter/unsubscribe/route');
    const req = new Request('http://localhost/api/newsletter/unsubscribe?email=lead@example.ca&token=bad');
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
    expect(prisma.newsletterSubscriber.updateMany).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('400 si email ou token manquant', async () => {
    const { GET } = await import('@/app/api/newsletter/unsubscribe/route');
    const req = new Request('http://localhost/api/newsletter/unsubscribe');
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(400);
  });
});
