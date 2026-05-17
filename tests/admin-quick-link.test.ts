/**
 * Tests pour POST /api/admin/orders/quick-link.
 *
 * Couvre :
 *   - Auth gate (admin required)
 *   - Validation (email format, productId positif, optionIds non-vide)
 *   - Lookup Sinalite (404 si product n'existe pas → erreur claire)
 *   - Construction du deep-link avec productId + optionIds
 *   - Envoi email avec reply-to = admin
 *   - Audit log avec action=QUICK_LINK_SENT
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(async () => ({
    ok: true,
    user: { id: 'admin_1', email: 'admin@plio.ca', name: 'Patrick' },
    userId: 'admin_1',
  })),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    adminAuditEvent: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true })),
}));

vi.mock('@/lib/sinalite/client', () => ({
  sinalite: {
    getProduct: vi.fn(async () => ({ name: 'Cartes 14pt Profit Maximizer' })),
  },
}));

import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { sinalite } from '@/lib/sinalite/client';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    user: { id: 'admin_1', email: 'admin@plio.ca', name: 'Patrick' },
    userId: 'admin_1',
  } as never);
  vi.mocked(sinalite.getProduct).mockResolvedValue({
    name: 'Cartes 14pt Profit Maximizer',
  } as never);
});

describe('POST /api/admin/orders/quick-link', () => {
  it('envoie l\'email avec deep-link et reply-to admin', async () => {
    const { POST } = await import('@/app/api/admin/orders/quick-link/route');
    const res = await POST(makeReq({
      customerEmail: 'client@example.ca',
      productId: 1,
      optionIds: [4, 30, 107, 224, 78, 5],
      note: 'Comme on a discuté au téléphone',
    }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.to).toBe('client@example.ca');
    expect(j.deepLink).toMatch(/\/order\/configure\?productId=1&options=4,30,107,224,78,5$/);

    expect(sendAdminCustomMessageEmail).toHaveBeenCalledOnce();
    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(args.to).toBe('client@example.ca');
    expect(args.replyTo).toBe('admin@plio.ca');
    expect(args.vars.SUBJECT).toContain('Cartes 14pt');
    expect(args.vars.BODY_HTML).toContain('Comme on a discuté');
    expect(args.vars.BODY_HTML).toContain('options=4,30,107,224,78,5');
  });

  it('400 si product Sinalite introuvable', async () => {
    vi.mocked(sinalite.getProduct).mockRejectedValueOnce(new Error('not found'));
    const { POST } = await import('@/app/api/admin/orders/quick-link/route');
    const res = await POST(makeReq({
      customerEmail: 'client@example.ca',
      productId: 99999,
      optionIds: [1],
    }));
    expect(res.status).toBe(400);
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
  });

  it('400 si email invalide', async () => {
    const { POST } = await import('@/app/api/admin/orders/quick-link/route');
    const res = await POST(makeReq({
      customerEmail: 'pas-un-email',
      productId: 1,
      optionIds: [4],
    }));
    expect(res.status).toBe(400);
  });

  it('400 si optionIds vide', async () => {
    const { POST } = await import('@/app/api/admin/orders/quick-link/route');
    const res = await POST(makeReq({
      customerEmail: 'client@example.ca',
      productId: 1,
      optionIds: [],
    }));
    expect(res.status).toBe(400);
  });

  it('audit log avec action=QUICK_LINK_SENT + targetId=email lowercase', async () => {
    const { POST } = await import('@/app/api/admin/orders/quick-link/route');
    await POST(makeReq({
      customerEmail: 'Client@Example.CA',
      productId: 1,
      optionIds: [4, 30],
    }));
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledOnce();
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(audit.data.targetType).toBe('USER');
    expect(audit.data.targetId).toBe('client@example.ca'); // lowercased par recordAdminAudit
    const data = JSON.parse(audit.data.data as string);
    expect(data.action).toBe('QUICK_LINK_SENT');
    expect(data.productId).toBe(1);
    expect(data.optionIds).toEqual([4, 30]);
  });

  it('SENDER_NAME = nom admin, fallback email prefix si nom null', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: true,
      user: { id: 'admin_1', email: 'pat@plio.ca', name: null },
      userId: 'admin_1',
    } as never);
    const { POST } = await import('@/app/api/admin/orders/quick-link/route');
    await POST(makeReq({
      customerEmail: 'client@example.ca',
      productId: 1,
      optionIds: [1],
    }));
    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(args.vars.SENDER_NAME).toBe('pat');
  });

  it('refuse non-admin via requireAdmin', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }) as never,
    } as never);
    const { POST } = await import('@/app/api/admin/orders/quick-link/route');
    const res = await POST(makeReq({
      customerEmail: 'client@example.ca',
      productId: 1,
      optionIds: [1],
    }));
    expect(res.status).toBe(403);
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
  });
});
