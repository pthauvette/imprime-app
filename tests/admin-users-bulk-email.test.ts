/**
 * Tests pour POST /api/admin/users/bulk action=send-email — Round 27 #2.
 *
 * Lock-in :
 *   - Zod : subject + body min/max + 50 ids max
 *   - 400 si subject < 3 ou body < 10 (anti-empty broadcast)
 *   - Filtre opt-out emailMarketing (CASL)
 *   - Skip self-broadcast (anti foot-gun pré-existant)
 *   - Audit log avec count + truncated ids
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(async () => ({
    ok: true,
    userId: 'admin_1',
    user: { id: 'admin_1', email: 'admin@plio.ca' },
  })),
}));

vi.mock('@/lib/db/admin-audit', () => ({
  recordAdminAudit: vi.fn(),
}));

vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true, id: 'em_1' })),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub };
});

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

function makePost(body: unknown): Request {
  return new Request('http://localhost/api/admin/users/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    userId: 'admin_1',
    user: { id: 'admin_1', email: 'admin@plio.ca' },
  } as never);
  // Default : findMany returns [] so route doesn't crash on iterate
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(sendAdminCustomMessageEmail).mockResolvedValue({ sent: true, id: 'em_1' } as never);
});

describe('POST /api/admin/users/bulk action=send-email (Round 27 #2)', () => {
  it('400 si subject < 3 chars', async () => {
    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(makePost({
      action: 'send-email', userIds: ['u1'], subject: 'ok', body: 'Hello world hello',
    }));
    expect(res.status).toBe(400);
  });

  it('400 si body < 10 chars (anti-empty)', async () => {
    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(makePost({
      action: 'send-email', userIds: ['u1'], subject: 'Hello', body: 'short',
    }));
    expect(res.status).toBe(400);
  });

  it('400 si subject > 150 chars', async () => {
    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(makePost({
      action: 'send-email', userIds: ['u1'], subject: 'a'.repeat(151), body: 'Hello there friend',
    }));
    expect(res.status).toBe(400);
  });

  it('400 si > 50 userIds (cap email plus serré que les autres actions)', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `u_${i}`);
    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(makePost({
      action: 'send-email', userIds: ids, subject: 'Hello', body: 'Hello there friend',
    }));
    expect(res.status).toBe(400);
  });

  it('filtre opt-out emailMarketing (CASL) avant envoi', async () => {
    // 3 users selected, only 1 has emailMarketing=true (filtered DB-side)
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u2', email: 'b@plio.ca', firstName: 'B' },
    ] as never);

    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(makePost({
      action: 'send-email',
      userIds: ['u1', 'u2', 'u3'],
      subject: 'Promo juin',
      body: 'Salut, on a une nouvelle promo!',
    }));
    expect(res.status).toBe(200);

    // findMany doit avoir filtré emailMarketing: true
    const args = vi.mocked(prisma.user.findMany).mock.calls[0][0];
    expect(args?.where).toMatchObject({ emailMarketing: true });

    // Un seul email envoyé (le seul opted-in)
    expect(sendAdminCustomMessageEmail).toHaveBeenCalledTimes(1);

    const json = await res.json();
    expect(json.affected).toBe(1);
  });

  it('exclude self : admin ne peut pas s\'envoyer un email à lui-même', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);

    const { POST } = await import('@/app/api/admin/users/bulk/route');
    const res = await POST(makePost({
      action: 'send-email',
      userIds: ['admin_1'], // self
      subject: 'Hello me',
      body: 'Talking to myself again',
    }));
    expect(res.status).toBe(400);
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
  });

  it('audit log avec action=USER_BULK_SEND-EMAIL + counts', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: 'a@plio.ca', firstName: 'A' },
      { id: 'u2', email: 'b@plio.ca', firstName: 'B' },
    ] as never);

    const { POST } = await import('@/app/api/admin/users/bulk/route');
    await POST(makePost({
      action: 'send-email',
      userIds: ['u1', 'u2'],
      subject: 'Promo',
      body: 'Voici les détails de la promo de juin',
    }));

    expect(recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin_1',
      data: expect.objectContaining({
        action: 'USER_BULK_SEND-EMAIL',
        requestedCount: 2,
        affectedCount: 2,
      }),
    }));
  });

  it('Reply-To set sur l\'email de l\'admin sender (route to inbox)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: 'cust@plio.ca', firstName: 'C' },
    ] as never);

    const { POST } = await import('@/app/api/admin/users/bulk/route');
    await POST(makePost({
      action: 'send-email',
      userIds: ['u1'],
      subject: 'Question pour toi',
      body: 'Comment trouves-tu nos cartes?',
    }));

    const call = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(call.replyTo).toBe('admin@plio.ca');
    expect(call.to).toBe('cust@plio.ca');
    expect(call.vars.SUBJECT).toBe('Question pour toi');
  });

  it('escape HTML dans le body (anti-XSS basique)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'u1', email: 'a@plio.ca', firstName: 'A' },
    ] as never);

    const { POST } = await import('@/app/api/admin/users/bulk/route');
    await POST(makePost({
      action: 'send-email',
      userIds: ['u1'],
      subject: 'Hello',
      body: '<script>alert("xss")</script>Some content',
    }));

    const call = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(call.vars.BODY_HTML).not.toContain('<script>');
    expect(call.vars.BODY_HTML).toContain('&lt;script&gt;');
  });
});
