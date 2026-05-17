/**
 * Tests pour les nouveaux admin endpoints :
 *   - PATCH /api/admin/orders/[id]/notes
 *   - POST  /api/admin/orders/[id]/message
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    adminAuditEvent: {
      create: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(async () => ({
    ok: true,
    user: { id: 'admin_1', email: 'admin@plio.ca', name: 'Patrick' },
    userId: 'admin_1',
  })),
}));

vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true })),
}));

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

function makeReq(method: string, body: unknown): Request {
  return new Request('http://localhost/x', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    user: { id: 'admin_1', email: 'admin@plio.ca', name: 'Patrick' },
    userId: 'admin_1',
  } as never);
});

// ─── NOTES ────────────────────────────────────────────────────────────────

describe('PATCH /api/admin/orders/[id]/notes', () => {
  beforeEach(() => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'order_1',
      adminNotes: 'note précédente',
    } as never);
  });

  it('update les notes + audit log', async () => {
    const { PATCH } = await import('@/app/api/admin/orders/[id]/notes/route');
    const res = await PATCH(makeReq('PATCH', { notes: 'Nouvelle note' }), ctxFor('order_1'));
    expect(res.status).toBe(200);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { adminNotes: 'Nouvelle note' },
    });
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledOnce();
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(audit.data.targetType).toBe('ORDER');
    expect(JSON.parse(audit.data.data as string).previousSnippet).toBe('note précédente');
  });

  it('null clear → adminNotes=null', async () => {
    const { PATCH } = await import('@/app/api/admin/orders/[id]/notes/route');
    await PATCH(makeReq('PATCH', { notes: null }), ctxFor('order_1'));
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { adminNotes: null },
    });
  });

  it('whitespace-only string → adminNotes=null (normalisation)', async () => {
    const { PATCH } = await import('@/app/api/admin/orders/[id]/notes/route');
    await PATCH(makeReq('PATCH', { notes: '   \n  ' }), ctxFor('order_1'));
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { adminNotes: null },
    });
  });

  it('no-op early return si identique (skip audit)', async () => {
    const { PATCH } = await import('@/app/api/admin/orders/[id]/notes/route');
    const res = await PATCH(makeReq('PATCH', { notes: 'note précédente' }), ctxFor('order_1'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.unchanged).toBe(true);
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.adminAuditEvent.create).not.toHaveBeenCalled();
  });

  it('404 si order introuvable', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(null);
    const { PATCH } = await import('@/app/api/admin/orders/[id]/notes/route');
    const res = await PATCH(makeReq('PATCH', { notes: 'x' }), ctxFor('missing'));
    expect(res.status).toBe(404);
  });

  it('refuse non-admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }) as never,
    } as never);
    const { PATCH } = await import('@/app/api/admin/orders/[id]/notes/route');
    const res = await PATCH(makeReq('PATCH', { notes: 'x' }), ctxFor('order_1'));
    expect(res.status).toBe(403);
  });

  it('refuse notes > 5000 chars', async () => {
    const { PATCH } = await import('@/app/api/admin/orders/[id]/notes/route');
    const big = 'x'.repeat(5001);
    const res = await PATCH(makeReq('PATCH', { notes: big }), ctxFor('order_1'));
    expect(res.status).toBe(400);
  });
});

// ─── MESSAGE ──────────────────────────────────────────────────────────────

describe('POST /api/admin/orders/[id]/message', () => {
  beforeEach(() => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'order_1',
      sinaliteOrderId: '48312',
      user: { email: 'client@example.ca', name: 'Client X' },
    } as never);
  });

  it('envoie l\'email avec reply-to = admin email', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/message/route');
    const res = await POST(
      makeReq('POST', { subject: 'Question sur ton fichier', body: 'Salut !\n\nTon PDF est en basse résolution.' }),
      ctxFor('order_1'),
    );
    expect(res.status).toBe(200);
    expect(sendAdminCustomMessageEmail).toHaveBeenCalledOnce();
    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(args.to).toBe('client@example.ca');
    expect(args.replyTo).toBe('admin@plio.ca');
    expect(args.vars.SUBJECT).toBe('Question sur ton fichier');
    expect(args.vars.SENDER_NAME).toBe('Patrick');
    expect(args.vars.SENDER_EMAIL).toBe('admin@plio.ca');
    expect(args.vars.ORDER_ID).toBe('48312');
  });

  it('split paragraphes sur \\n\\n et escape HTML dangereux', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/message/route');
    const body = 'Premier paragraphe.\n\nDeuxième avec <script>alert(1)</script> à escape.';
    await POST(makeReq('POST', { subject: 'Test', body }), ctxFor('order_1'));
    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(args.vars.BODY_HTML).toContain('<p style');
    expect(args.vars.BODY_HTML).toContain('&lt;script&gt;');
    expect(args.vars.BODY_HTML).not.toContain('<script>');
    // 2 paragraphes attendus
    expect((args.vars.BODY_HTML.match(/<p /g) ?? []).length).toBe(2);
  });

  it('PREVIEW = premiers 120 chars du body', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/message/route');
    const body = 'A'.repeat(150);
    await POST(makeReq('POST', { subject: 'X', body }), ctxFor('order_1'));
    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(args.vars.PREVIEW.length).toBe(120);
  });

  it('audit log avec subject + bodyLength', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/message/route');
    await POST(makeReq('POST', { subject: 'Hello', body: 'world' }), ctxFor('order_1'));
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledOnce();
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(audit.data.targetType).toBe('ORDER');
    const data = JSON.parse(audit.data.data as string);
    expect(data.action).toBe('CUSTOM_MESSAGE_SENT');
    expect(data.subject).toBe('Hello');
    expect(data.bodyLength).toBe(5);
  });

  it('404 si order introuvable', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/admin/orders/[id]/message/route');
    const res = await POST(makeReq('POST', { subject: 'X', body: 'Y' }), ctxFor('missing'));
    expect(res.status).toBe(404);
  });

  it('refuse subject vide', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/message/route');
    const res = await POST(makeReq('POST', { subject: '', body: 'Y' }), ctxFor('order_1'));
    expect(res.status).toBe(400);
  });

  it('SENDER_NAME fallback = email prefix si pas de name', async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: true,
      user: { id: 'admin_1', email: 'pat@plio.ca', name: null },
      userId: 'admin_1',
    } as never);
    const { POST } = await import('@/app/api/admin/orders/[id]/message/route');
    await POST(makeReq('POST', { subject: 'X', body: 'Y' }), ctxFor('order_1'));
    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(args.vars.SENDER_NAME).toBe('pat');
  });
});
