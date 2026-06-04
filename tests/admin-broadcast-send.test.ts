/**
 * Tests pour POST /api/admin/broadcast — Round 16 #5.
 *
 * Cible : la route orchestre auth + Zod + resolveRecipients + count
 * drift check + queueEmail + recordAdminAudit + EmailBroadcast row.
 * On mock toutes les dépendances et on test la choréographie.
 *
 * Tests :
 *   - 401/403 si non-admin (via requireAdmin mocked)
 *   - 400 si Zod schema fail (subject empty, body < 20, segment invalide)
 *   - 409 si count drift > 10 % entre preview et send
 *   - 400 si recipients vide
 *   - 400 si > 10 000 recipients (hard cap)
 *   - Happy path : crée EmailBroadcast row + queueEmail par recipient +
 *     audit log + response shape
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    emailBroadcast: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'bcast_test_123',
        ...args.data,
      })),
      update: vi.fn(async () => ({})),
    },
    // H2 — dispatchBroadcast préfetch les labels par-destinataire déjà livrés.
    emailDelivery: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(async () => ({
    ok: true,
    userId: 'admin_user_1',
    user: { id: 'admin_user_1', email: 'admin@plio.ca' },
  })),
}));

vi.mock('@/lib/db/admin-audit', () => ({
  recordAdminAudit: vi.fn(async () => ({})),
}));

vi.mock('@/lib/broadcast/recipients', () => ({
  resolveRecipients: vi.fn(async () => ['a@x.com', 'b@x.com', 'c@x.com']),
  previewRecipientCount: vi.fn(async () => 3),
}));

vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true, id: 'del_xyz' })),
}));

vi.mock('@/lib/newsletter/token', () => ({
  newsletterUnsubscribeToken: vi.fn(() => 'token_xyz'),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return {
    log: stub, logEmail: stub, logAdmin: stub,
  };
});

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { resolveRecipients } from '@/lib/broadcast/recipients';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

const URL = 'http://localhost/api/admin/broadcast';

function makePost(body: unknown): Request {
  return new Request(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  subject: 'Nouveau papier 18pt SOFT TOUCH',
  body: 'Salut,\n\nOn vient d\'ajouter le 18pt SOFT TOUCH. Voici les détails.',
  segment: 'newsletter',
  confirmedCount: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    userId: 'admin_user_1',
    user: { id: 'admin_user_1', email: 'admin@plio.ca' },
  } as never);
  vi.mocked(resolveRecipients).mockResolvedValue(['a@x.com', 'b@x.com', 'c@x.com']);
  vi.mocked(sendAdminCustomMessageEmail).mockResolvedValue({ sent: true, id: 'del_xyz' });
  vi.resetModules();
});

describe('POST /api/admin/broadcast — auth gate', () => {
  it('renvoie la response 401/403 du guard si non-admin', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    } as never);
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(403);
    expect(prisma.emailBroadcast.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/broadcast — Zod validation', () => {
  it('400 si subject vide', async () => {
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost({ ...validBody, subject: '' }));
    expect(res.status).toBe(400);
  });

  it('400 si body < 20 chars', async () => {
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost({ ...validBody, body: 'trop court' }));
    expect(res.status).toBe(400);
  });

  it('400 si segment invalide', async () => {
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost({ ...validBody, segment: 'bogus-segment' }));
    expect(res.status).toBe(400);
  });

  it('400 si confirmedCount manque', async () => {
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const { confirmedCount: _omit, ...withoutCount } = validBody;
    void _omit;
    const res = await POST(makePost(withoutCount));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/broadcast — count drift gate', () => {
  it('409 si actual > confirmedCount + 10 %', async () => {
    vi.mocked(resolveRecipients).mockResolvedValueOnce(
      Array.from({ length: 50 }, (_, i) => `user${i}@x.com`),
    );
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost({ ...validBody, confirmedCount: 3 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('COUNT_DRIFT');
    expect(json.actual).toBe(50);
    expect(prisma.emailBroadcast.create).not.toHaveBeenCalled();
  });

  it('passe si actual dans la tolérance (±10 %)', async () => {
    vi.mocked(resolveRecipients).mockResolvedValueOnce(
      Array.from({ length: 105 }, (_, i) => `user${i}@x.com`),
    );
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost({ ...validBody, confirmedCount: 100 }));
    expect(res.status).toBe(200);
  });

  it('passe si drift absolu ≤ 5 même si % > 10', async () => {
    vi.mocked(resolveRecipients).mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => `user${i}@x.com`),
    );
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost({ ...validBody, confirmedCount: 3 }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/broadcast — guardrails', () => {
  it('400 NO_RECIPIENTS si liste vide', async () => {
    vi.mocked(resolveRecipients).mockResolvedValueOnce([]);
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost({ ...validBody, confirmedCount: 0 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('NO_RECIPIENTS');
  });

  it('400 TOO_LARGE si > 10 000 destinataires', async () => {
    const tooMany = Array.from({ length: 10_001 }, (_, i) => `u${i}@x.com`);
    vi.mocked(resolveRecipients).mockResolvedValueOnce(tooMany);
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost({ ...validBody, confirmedCount: 10_001 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('TOO_LARGE');
  });
});

describe('POST /api/admin/broadcast — happy path', () => {
  it('crée EmailBroadcast + queueEmail par recipient + audit log', async () => {
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(200);

    expect(prisma.emailBroadcast.create).toHaveBeenCalledOnce();
    const createCall = vi.mocked(prisma.emailBroadcast.create).mock.calls[0]![0];
    expect(createCall.data).toEqual(expect.objectContaining({
      subject: validBody.subject,
      segment: 'newsletter',
      recipientCount: 3,
      status: 'QUEUED',
      adminEmail: 'admin@plio.ca',
    }));

    expect(sendAdminCustomMessageEmail).toHaveBeenCalledTimes(3); // 3 recipients
    const firstSend = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0]![0];
    expect(firstSend.to).toBe('a@x.com');
    expect(firstSend.replyTo).toBe('admin@plio.ca');

    expect(prisma.emailBroadcast.update).toHaveBeenCalledOnce();
    const updateCall = vi.mocked(prisma.emailBroadcast.update).mock.calls[0]![0];
    expect(updateCall.data).toEqual(expect.objectContaining({
      status: 'SENT',
      recipientCount: 3,
    }));

    expect(recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'ADMIN_RESEND_EMAIL',
      adminId: 'admin_user_1',
      data: expect.objectContaining({
        action: 'BROADCAST_SENT',
        segment: 'newsletter',
        recipientCount: 3,
      }),
    }));

    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      enqueued: 3,
      requested: 3,
      broadcastId: 'bcast_test_123',
    });
  });

  it('continue si un sendAdminCustomMessageEmail throw (best-effort)', async () => {
    vi.mocked(sendAdminCustomMessageEmail)
      .mockResolvedValueOnce({ sent: true, id: 'del1' })
      .mockRejectedValueOnce(new Error('SES throttle'))
      .mockResolvedValueOnce({ sent: true, id: 'del3' });

    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.enqueued).toBe(2); // 2 sur 3 ont passé
    expect(json.requested).toBe(3);
  });
});

describe('POST /api/admin/broadcast — segments multiples', () => {
  it('accepte tier-gold', async () => {
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost({ ...validBody, segment: 'tier-gold' }));
    expect(res.status).toBe(200);
  });

  it('accepte inactive-90d', async () => {
    const { POST } = await import('@/app/api/admin/broadcast/route');
    const res = await POST(makePost({ ...validBody, segment: 'inactive-90d' }));
    expect(res.status).toBe(200);
  });
});
