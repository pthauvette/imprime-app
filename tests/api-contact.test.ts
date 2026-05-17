/**
 * Tests pour POST /api/contact — formulaire public, envoie email à
 * tous ADMIN_EMAILS avec reply-to = sender.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    adminAuditEvent: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true })),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

import { prisma } from '@/lib/db';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { rateLimit } from '@/lib/ratelimit';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function importFresh() {
  vi.resetModules();
  return (await import('@/app/api/contact/route')).POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true } as never);
  vi.mocked(sendAdminCustomMessageEmail).mockResolvedValue({ sent: true } as never);
  vi.stubEnv('ADMIN_EMAILS', 'admin@plio.ca');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/contact', () => {
  it('envoie le message à chaque ADMIN_EMAILS avec reply-to = sender', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@plio.ca,sales@plio.ca');
    const POST = await importFresh();
    const res = await POST(makeReq({
      name: 'Sophie Beauchamp',
      email: 'sophie@studio.ca',
      subject: 'Question avant achat',
      message: 'Hello bonjour, j\'ai une question sur les cartes 14pt.',
    }));
    expect(res.status).toBe(200);
    expect(sendAdminCustomMessageEmail).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(firstCall.to).toBe('admin@plio.ca');
    expect(firstCall.replyTo).toBe('sophie@studio.ca');
    expect(firstCall.vars.SUBJECT).toMatch(/^\[Contact\]/);
    expect(firstCall.vars.SUBJECT).toContain('Question avant achat');
    expect(firstCall.vars.SUBJECT).toContain('Sophie Beauchamp');
  });

  it('escape HTML dans le message (XSS protection)', async () => {
    const POST = await importFresh();
    await POST(makeReq({
      name: 'Test',
      email: 'test@plio.ca',
      subject: 'Test',
      message: 'Hello <script>alert(1)</script> world',
    }));
    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(args.vars.BODY_HTML).toContain('&lt;script&gt;');
    expect(args.vars.BODY_HTML).not.toContain('<script>');
  });

  it('400 si message trop court (< 10 chars)', async () => {
    const POST = await importFresh();
    const res = await POST(makeReq({
      name: 'Test',
      email: 'test@plio.ca',
      subject: 'Test',
      message: 'court',
    }));
    expect(res.status).toBe(400);
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
  });

  it('400 si email invalide', async () => {
    const POST = await importFresh();
    const res = await POST(makeReq({
      name: 'Test',
      email: 'pas-un-email',
      subject: 'Test',
      message: 'Message assez long ici',
    }));
    expect(res.status).toBe(400);
  });

  it('400 si message trop long (> 5000 chars)', async () => {
    const POST = await importFresh();
    const big = 'x'.repeat(5001);
    const res = await POST(makeReq({
      name: 'Test',
      email: 'test@plio.ca',
      subject: 'Test',
      message: big,
    }));
    expect(res.status).toBe(400);
  });

  it('503 si ADMIN_EMAILS pas configuré', async () => {
    vi.stubEnv('ADMIN_EMAILS', '');
    const POST = await importFresh();
    const res = await POST(makeReq({
      name: 'Test',
      email: 'test@plio.ca',
      subject: 'Test',
      message: 'Message assez long ici',
    }));
    expect(res.status).toBe(503);
  });

  it('502 si toutes les sends échouent', async () => {
    vi.mocked(sendAdminCustomMessageEmail).mockResolvedValue({ sent: false, id: 'del_fail' } as never);
    const POST = await importFresh();
    const res = await POST(makeReq({
      name: 'Test',
      email: 'test@plio.ca',
      subject: 'Test',
      message: 'Message assez long ici',
    }));
    expect(res.status).toBe(502);
  });

  it('200 OK si au moins un des sends marche', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'a@plio.ca,b@plio.ca');
    vi.mocked(sendAdminCustomMessageEmail)
      .mockResolvedValueOnce({ sent: false, id: 'del_fail' } as never)
      .mockResolvedValueOnce({ sent: true, id: 'del_ok' } as never);
    const POST = await importFresh();
    const res = await POST(makeReq({
      name: 'Test',
      email: 'test@plio.ca',
      subject: 'Test',
      message: 'Message assez long ici',
    }));
    expect(res.status).toBe(200);
  });

  it('respect rate limit (return 429 si bucket dépassé)', async () => {
    const limitResponse = new Response(JSON.stringify({ error: 'rate limit' }), { status: 429 });
    vi.mocked(rateLimit).mockResolvedValueOnce({ ok: false, response: limitResponse } as never);
    const POST = await importFresh();
    const res = await POST(makeReq({
      name: 'Test',
      email: 'test@plio.ca',
      subject: 'Test',
      message: 'Message assez long ici',
    }));
    expect(res.status).toBe(429);
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
  });

  it('audit log avec action=CONTACT_FORM_SUBMISSION + targetId=email lowercase', async () => {
    const POST = await importFresh();
    await POST(makeReq({
      name: 'Test',
      email: 'Test@Plio.CA',
      subject: 'Test',
      message: 'Message assez long ici',
    }));
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledOnce();
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(audit.data.targetType).toBe('USER');
    expect(audit.data.targetId).toBe('test@plio.ca');
    const data = JSON.parse(audit.data.data as string);
    expect(data.action).toBe('CONTACT_FORM_SUBMISSION');
    expect(data.ip).toBe('1.2.3.4');
  });
});
