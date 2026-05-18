/**
 * Tests pour l'admin email preview :
 *   - sample-vars contient les 11 templates
 *   - renderEmail accepte chaque sample sans crash
 *   - POST /api/admin/email-preview/send valide template + envoie
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    adminAuditEvent: { create: vi.fn(async () => ({})) },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/emails/render', async () => {
  const actual = await vi.importActual('@/lib/emails/render');
  return {
    ...actual,
    sendEmail: vi.fn(async () => ({ sent: true })),
  };
});

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { sendEmail, renderEmail } from '@/lib/emails/render';
import { SAMPLE_VARS, ALL_TEMPLATES, getSampleVars } from '@/lib/emails/sample-vars';

function adminSession() {
  return {
    user: { id: 'admin_1', email: 'admin@plio.ca', role: 'ADMIN' },
  };
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/email-preview/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function importFresh() {
  vi.resetModules();
  return (await import('@/app/api/admin/email-preview/send/route')).POST;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sample-vars + render', () => {
  it('SAMPLE_VARS contient les 11 templates', () => {
    expect(Object.keys(SAMPLE_VARS).sort()).toEqual([...ALL_TEMPLATES].sort());
  });

  it.each(ALL_TEMPLATES)('renderEmail(%s) avec sample vars ne throw pas', (template) => {
    const vars = getSampleVars(template);
    const html = renderEmail(template, vars);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100); // sanity: pas un template vide
    // Aucun placeholder {{}} non-substitué (sauf si vide intentionnel)
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});

describe('POST /api/admin/email-preview/send', () => {
  it('envoie l\'email à l\'admin courant avec préfixe [PREVIEW]', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(sendEmail).mockResolvedValue({ sent: true } as never);

    const POST = await importFresh();
    const res = await POST(makeReq({
      template: 'welcome',
      vars: getSampleVars('welcome'),
      subject: 'Test sujet',
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.to).toBe('admin@plio.ca');

    const sendCall = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sendCall.to).toBe('admin@plio.ca');
    expect(sendCall.template).toBe('welcome');
    expect(sendCall.subject).toBe('[PREVIEW] Test sujet');
  });

  it('400 si template inconnu', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);

    const POST = await importFresh();
    const res = await POST(makeReq({
      template: 'pas-un-template',
      vars: {},
    }));

    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('401 si non-authentifié', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const POST = await importFresh();
    const res = await POST(makeReq({
      template: 'welcome',
      vars: getSampleVars('welcome'),
    }));

    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('403 si user non-admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', email: 'u@plio.ca', role: 'USER' },
    } as never);

    const POST = await importFresh();
    const res = await POST(makeReq({
      template: 'welcome',
      vars: getSampleVars('welcome'),
    }));

    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('502 si sendEmail throw (SES down)', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('SES timeout'));

    const POST = await importFresh();
    const res = await POST(makeReq({
      template: 'welcome',
      vars: getSampleVars('welcome'),
    }));

    expect(res.status).toBe(502);
  });

  it('audit log enregistré avec action=EMAIL_PREVIEW_TEST', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(sendEmail).mockResolvedValue({ sent: true } as never);

    const POST = await importFresh();
    await POST(makeReq({
      template: 'order-confirmation',
      vars: getSampleVars('order-confirmation'),
    }));

    // recordAdminAudit fait un prisma.adminAuditEvent.create — on vérifie
    // qu'il a été appelé.
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    const data = JSON.parse(audit.data.data as string);
    expect(data.action).toBe('EMAIL_PREVIEW_TEST');
    expect(data.template).toBe('order-confirmation');
  });
});
