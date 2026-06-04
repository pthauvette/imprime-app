/**
 * Tests pour le throttle CASL — Round 37 #3.
 *
 * Lock-in :
 *   - User avec < 5 emails/24h → email envoyé normalement
 *   - User avec ≥ 5 emails/24h → skipped 'throttled', pas d'INSERT
 *   - Templates transactional (order-confirmation, payment-failed, etc.)
 *     bypassent le cap même si user a déjà 100 emails
 *   - Throttle check fail (DB) → fail-soft, continue le send
 *   - admin-custom-message retiré du MARKETING_TEMPLATES set
 *     (donc pas d'unsub header auto)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    emailDelivery: {
      create: vi.fn(async () => ({
        id: 'del_throttle',
        to: 'a@b.ca',
        template: 'reseller-monthly-stats',
        varsJson: '{}',
        subject: null,
        replyTo: null,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        nextAttemptAt: null,
        sentAt: null,
        createdAt: new Date(),
        attachOrderId: null,
        label: null,
      })),
      findUnique: vi.fn(async () => null),
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 0 })),
      count: vi.fn(async () => 0),
    },
  },
}));

vi.mock('@/lib/emails/render', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
}));

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => true),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { logEmail: stub, log: stub };
});

import { prisma } from '@/lib/db';
import { queueEmail } from '@/lib/emails/queue';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('queueEmail throttle (Round 37 #3)', () => {
  it('user avec 0 emails récents → envoi normal', async () => {
    vi.mocked(prisma.emailDelivery.count).mockResolvedValue(0);
    const res = await queueEmail({
      to: 'fresh@plio.ca',
      template: 'reseller-monthly-stats',
      vars: {},
    });
    expect(res.skipped).toBeUndefined();
    expect(prisma.emailDelivery.create).toHaveBeenCalledOnce();
  });

  it('user avec 5 emails récents → THROTTLED, no INSERT', async () => {
    vi.mocked(prisma.emailDelivery.count).mockResolvedValue(5);
    const res = await queueEmail({
      to: 'heavy@plio.ca',
      template: 'reseller-monthly-stats',
      vars: {},
    });
    expect(res.skipped).toBe('throttled');
    expect(res.sent).toBe(false);
    expect(prisma.emailDelivery.create).not.toHaveBeenCalled();
  });

  it('user avec 10 emails récents → THROTTLED', async () => {
    vi.mocked(prisma.emailDelivery.count).mockResolvedValue(10);
    const res = await queueEmail({
      to: 'spam@plio.ca',
      template: 'abandoned-cart',
      vars: {},
    });
    expect(res.skipped).toBe('throttled');
  });

  it('throttle EXEMPT pour order-confirmation (transactional)', async () => {
    vi.mocked(prisma.emailDelivery.count).mockResolvedValue(100);
    const res = await queueEmail({
      to: 'heavy@plio.ca',
      template: 'order-confirmation',
      vars: {},
    });
    expect(res.skipped).toBeUndefined();
    expect(prisma.emailDelivery.create).toHaveBeenCalledOnce();
    // Important : count NE doit PAS être appelé pour template exempt
    // (pas de DB hit pour les transactional → préserve la latence checkout)
    expect(prisma.emailDelivery.count).not.toHaveBeenCalled();
  });

  it('throttle EXEMPT pour magic-link, payment-failed, refund-issued', async () => {
    vi.mocked(prisma.emailDelivery.count).mockResolvedValue(100);
    for (const template of ['magic-link', 'payment-failed', 'refund-issued', 'welcome'] as const) {
      vi.clearAllMocks();
      const res = await queueEmail({ to: 'heavy@plio.ca', template, vars: {} });
      expect(res.skipped).toBeUndefined();
      expect(prisma.emailDelivery.create).toHaveBeenCalledOnce();
    }
  });

  it('M3 — admin-custom-message exempté par défaut, mais marketing:true → cap appliqué', async () => {
    // Par défaut (réponse 1:1 admin) → exempté même à 100 emails
    vi.clearAllMocks();
    vi.mocked(prisma.emailDelivery.count).mockResolvedValue(100);
    const exempt = await queueEmail({ to: 'heavy@plio.ca', template: 'admin-custom-message', vars: {} });
    expect(exempt.skipped).toBeUndefined();
    expect(prisma.emailDelivery.count).not.toHaveBeenCalled();

    // Broadcast (marketing:true) → soumis au cap CASL
    vi.clearAllMocks();
    vi.mocked(prisma.emailDelivery.count).mockResolvedValue(5);
    const throttled = await queueEmail({ to: 'heavy@plio.ca', template: 'admin-custom-message', vars: {}, marketing: true });
    expect(throttled.skipped).toBe('throttled');
    expect(prisma.emailDelivery.create).not.toHaveBeenCalled();
  });

  it('throttle DB query fail → fail-soft, continue le send', async () => {
    vi.mocked(prisma.emailDelivery.count).mockRejectedValueOnce(new Error('DB blip'));
    const res = await queueEmail({
      to: 'fresh@plio.ca',
      template: 'reseller-monthly-stats',
      vars: {},
    });
    // Pas throttled malgré DB fail (better send than skip on infra error)
    expect(res.skipped).toBeUndefined();
    expect(prisma.emailDelivery.create).toHaveBeenCalledOnce();
  });

  it('user check uses email lowercased (case-insensitive)', async () => {
    vi.mocked(prisma.emailDelivery.count).mockResolvedValue(0);
    await queueEmail({
      to: 'HEAVY@Plio.ca',
      template: 'reseller-monthly-stats',
      vars: {},
    });
    const countArgs = vi.mocked(prisma.emailDelivery.count).mock.calls[0]![0];
    expect((countArgs?.where as { to?: string } | undefined)?.to).toBe('heavy@plio.ca');
  });

  it('throttle window = 24h (paramètre createdAt gte)', async () => {
    vi.mocked(prisma.emailDelivery.count).mockResolvedValue(0);
    await queueEmail({
      to: 'fresh@plio.ca',
      template: 'reseller-monthly-stats',
      vars: {},
    });
    const countArgs = vi.mocked(prisma.emailDelivery.count).mock.calls[0]![0];
    const gte = (countArgs?.where as { createdAt?: { gte: Date } } | undefined)?.createdAt?.gte;
    expect(gte).toBeInstanceOf(Date);
    const expectedMs = Date.now() - 24 * 3600 * 1000;
    expect(Math.abs(gte!.getTime() - expectedMs)).toBeLessThan(60_000);
  });
});
