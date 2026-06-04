/**
 * Tests pour Round 28 #4 — RFC 8058 one-click unsubscribe.
 *
 * Lock-in :
 *   - sendEmail passe listUnsubscribeUrl → headers SMTP corrects
 *   - oneClickUnsubscribeUrl auto-derive seulement pour marketing templates
 *   - Transactional templates (order-confirmation, magic-link) → NO header
 *   - POST /api/newsletter/unsubscribe : update NewsletterSubscriber + User
 *     en parallèle (RFC 8058 expects immediate no-confirm-page)
 *   - URL params : email + token validated, idempotent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    newsletterSubscriber: { updateMany: vi.fn(async () => ({ count: 1 })) },
    user: { updateMany: vi.fn(async () => ({ count: 1 })) },
    emailDelivery: {
      create: vi.fn(async () => { throw new Error('force fallback'); }),
    },
    order: { findUnique: vi.fn(async () => null) },
  },
}));

vi.mock('@/lib/emails/render', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
  EMAIL_SUBJECTS: {},
  // Audit v2 #7.8 — queue.ts importe désormais MARKETING_TEMPLATES de render.
  MARKETING_TEMPLATES: new Set(['reengagement-follow-up', 'reengagement-winback', 'reseller-monthly-stats']),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub, logEmail: stub };
});

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => undefined),
}));

// Audit-vérif M2 — le désabo enregistre désormais une suppression (couvre les
// invités abandoned-cart). On mocke pour isoler la route de la table EmailSuppression.
vi.mock('@/lib/emails/suppression', () => ({
  suppressEmail: vi.fn(async () => ({ created: true })),
}));

import { prisma } from '@/lib/db';
import * as render from '@/lib/emails/render';
import { queueEmail } from '@/lib/emails/queue';
import { newsletterUnsubscribeToken } from '@/lib/newsletter/token';
import { suppressEmail } from '@/lib/emails/suppression';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.emailDelivery.create).mockRejectedValue(new Error('force fallback'));
  vi.mocked(prisma.order.findUnique).mockResolvedValue(null as never);
  vi.mocked(render.sendEmail).mockResolvedValue({ sent: true } as never);
  process.env.AUTH_SECRET = 'fixed-test-secret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://plio.ca';
});

describe('queueEmail → sendEmail listUnsubscribeUrl auto-derive (Round 28 #4)', () => {
  it('marketing template → URL injected with email + HMAC token', async () => {
    await queueEmail({
      to: 'user@example.com',
      template: 'reseller-monthly-stats',
      vars: {},
    });

    expect(render.sendEmail).toHaveBeenCalledOnce();
    const call = vi.mocked(render.sendEmail).mock.calls[0]![0];
    expect(call.listUnsubscribeUrl).toBeDefined();
    expect(call.listUnsubscribeUrl).toContain('/api/newsletter/unsubscribe');
    expect(call.listUnsubscribeUrl).toContain('email=user%40example.com');
    expect(call.listUnsubscribeUrl).toContain(`token=${newsletterUnsubscribeToken('user@example.com')}`);
  });

  it('transactional template → NO header (order-confirmation jamais opt-out)', async () => {
    await queueEmail({
      to: 'user@example.com',
      template: 'order-confirmation',
      vars: {},
    });

    const call = vi.mocked(render.sendEmail).mock.calls[0]![0];
    expect(call.listUnsubscribeUrl).toBeUndefined();
  });

  it('magic-link → NO header (sign-in flow critical)', async () => {
    await queueEmail({
      to: 'user@example.com',
      template: 'magic-link',
      vars: {},
    });

    const call = vi.mocked(render.sendEmail).mock.calls[0]![0];
    expect(call.listUnsubscribeUrl).toBeUndefined();
  });

  it('email lowercased dans le URL param (case-insensitive matching)', async () => {
    // Round 37 #3 — Test utilise reseller-monthly-stats (encore marketing).
    // admin-custom-message a été retiré du MARKETING_TEMPLATES set car
    // utilisé pour transactional (wallet expiry warning, weekly digest)
    // → ne devrait plus auto-derive l'unsub.
    await queueEmail({
      to: 'MixedCase@Plio.CA',
      template: 'reseller-monthly-stats',
      vars: {},
    });

    const call = vi.mocked(render.sendEmail).mock.calls[0]![0];
    expect(call.listUnsubscribeUrl).toContain('email=mixedcase%40plio.ca');
  });

  it('Round 37 #3 — admin-custom-message NE auto-derive PAS l\'unsub (used pour transactional)', async () => {
    await queueEmail({
      to: 'user@plio.ca',
      template: 'admin-custom-message',
      vars: {},
    });
    const call = vi.mocked(render.sendEmail).mock.calls[0]![0];
    expect(call.listUnsubscribeUrl).toBeUndefined();
  });

  it('explicit override > auto-derive', async () => {
    await queueEmail({
      to: 'user@example.com',
      template: 'reseller-monthly-stats',
      vars: {},
      listUnsubscribeUrl: 'https://custom.example.com/u',
    });

    const call = vi.mocked(render.sendEmail).mock.calls[0]![0];
    expect(call.listUnsubscribeUrl).toBe('https://custom.example.com/u');
  });
});

describe('POST /api/newsletter/unsubscribe (Round 28 #4 RFC 8058)', () => {
  function makePost(email: string, token: string): Request {
    const url = `http://localhost/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
    return new Request(url, { method: 'POST' });
  }

  it('400 si email ou token manquant', async () => {
    const { POST } = await import('@/app/api/newsletter/unsubscribe/route');
    const res = await POST(new Request('http://localhost/api/newsletter/unsubscribe', { method: 'POST' }) as never);
    expect(res.status).toBe(400);
  });

  it('400 si token wrong (HMAC mismatch)', async () => {
    const { POST } = await import('@/app/api/newsletter/unsubscribe/route');
    const res = await POST(makePost('a@b.ca', 'wrong_token') as never);
    expect(res.status).toBe(400);
    expect(prisma.newsletterSubscriber.updateMany).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('200 OK + update BOTH NewsletterSubscriber AND User en parallèle', async () => {
    const email = 'a@b.ca';
    const token = newsletterUnsubscribeToken(email);
    const { POST } = await import('@/app/api/newsletter/unsubscribe/route');
    const res = await POST(makePost(email, token) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Both updateMany calls fired
    expect(prisma.newsletterSubscriber.updateMany).toHaveBeenCalledOnce();
    expect(prisma.user.updateMany).toHaveBeenCalledOnce();

    // NewsletterSubscriber : status UNSUBSCRIBED
    const nsCall = vi.mocked(prisma.newsletterSubscriber.updateMany).mock.calls[0]![0];
    expect(nsCall.where).toMatchObject({ email, status: 'ACTIVE' });
    expect(nsCall.data).toMatchObject({ status: 'UNSUBSCRIBED' });

    // User : emailMarketing → false
    const userCall = vi.mocked(prisma.user.updateMany).mock.calls[0]![0];
    expect(userCall.where).toMatchObject({ email, emailMarketing: true });
    expect(userCall.data).toMatchObject({ emailMarketing: false });

    // M2 — suppression enregistrée (couvre les invités sans compte ni abo)
    expect(suppressEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email, reason: 'MANUAL', source: 'USER_UNSUB' }),
    );
  });
});
