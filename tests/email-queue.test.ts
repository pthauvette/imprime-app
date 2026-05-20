/**
 * Tests pour la queue email + retry logic.
 *
 * Couvre :
 *   - queueEmail INSERT + immediate process (succès ou fail)
 *   - processDelivery success path → SENT
 *   - processDelivery fail path → FAILED + nextAttemptAt scheduled
 *   - 3e échec → DEAD + Slack alert
 *   - Idempotence : status SENT/DEAD ne se re-process pas
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    emailDelivery: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      // Round 17 #3 : updateMany ajouté pour claim atomique
      // (PENDING/FAILED → PROCESSING) dans processDelivery.
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
    },
  },
}));

vi.mock('@/lib/emails/render', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
}));

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => true),
}));

import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/emails/render';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import { queueEmail, processDelivery, getEmailsReadyForRetry } from '@/lib/emails/queue';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('queueEmail', () => {
  it('INSERT delivery row + tente envoi immédiat (succès)', async () => {
    vi.mocked(prisma.emailDelivery.create).mockResolvedValueOnce({
      id: 'del_1', to: 'a@b.ca', template: 'welcome', varsJson: '{}',
      subject: null, replyTo: null, status: 'PENDING', attempts: 0,
      maxAttempts: 3, lastError: null, nextAttemptAt: null, sentAt: null,
      label: null, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({
      id: 'del_1', to: 'a@b.ca', template: 'welcome', varsJson: '{}',
      subject: null, replyTo: null, status: 'PENDING', attempts: 0,
      maxAttempts: 3, lastError: null, nextAttemptAt: null, sentAt: null,
      label: null, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.emailDelivery.update).mockResolvedValueOnce({} as never);

    const r = await queueEmail({
      to: 'a@b.ca',
      template: 'welcome',
      vars: { CUSTOMER_FIRST_NAME: 'Test' },
      label: 'welcome:user_1',
    });

    expect(r.sent).toBe(true);
    expect(r.id).toBe('del_1');
    expect(prisma.emailDelivery.create).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
    // Status updated to SENT
    const updateCall = vi.mocked(prisma.emailDelivery.update).mock.calls[0][0];
    expect(updateCall.data.status).toBe('SENT');
    expect(updateCall.data.sentAt).toBeInstanceOf(Date);
  });

  it('fallback direct send si INSERT échoue (resilient)', async () => {
    vi.mocked(prisma.emailDelivery.create).mockRejectedValueOnce(new Error('DB down'));
    const r = await queueEmail({
      to: 'a@b.ca', template: 'welcome', vars: { CUSTOMER_FIRST_NAME: 'T' },
    });
    expect(r.id).toBe('no-queue-fallback');
    expect(r.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledOnce();
  });
});

describe('processDelivery — retry backoff', () => {
  const baseRow = {
    id: 'del_1', to: 'a@b.ca', template: 'welcome', varsJson: '{}',
    subject: null, replyTo: null, status: 'PENDING' as string, attempts: 0,
    maxAttempts: 3, lastError: null, nextAttemptAt: null, sentAt: null,
    label: null, createdAt: new Date(), updatedAt: new Date(),
  };

  it('attempt 1 fail → FAILED + nextAttemptAt +5min', async () => {
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({ ...baseRow } as never);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('SMTP timeout'));
    vi.mocked(prisma.emailDelivery.update).mockResolvedValueOnce({} as never);

    const before = Date.now();
    const r = await processDelivery('del_1');
    const after = Date.now();

    expect(r.sent).toBe(false);
    const call = vi.mocked(prisma.emailDelivery.update).mock.calls[0][0];
    expect(call.data.status).toBe('FAILED');
    expect(call.data.attempts).toBe(1);
    expect(call.data.lastError).toContain('SMTP timeout');
    // nextAttemptAt entre +5min et +5min+test duration
    const next = (call.data.nextAttemptAt as Date).getTime();
    expect(next).toBeGreaterThanOrEqual(before + 5 * 60 * 1000 - 100);
    expect(next).toBeLessThanOrEqual(after + 5 * 60 * 1000 + 100);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('attempt 2 fail → FAILED + nextAttemptAt +15min', async () => {
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({
      ...baseRow, status: 'FAILED', attempts: 1,
    } as never);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('still down'));
    vi.mocked(prisma.emailDelivery.update).mockResolvedValueOnce({} as never);

    const before = Date.now();
    await processDelivery('del_1');

    const call = vi.mocked(prisma.emailDelivery.update).mock.calls[0][0];
    expect(call.data.status).toBe('FAILED');
    expect(call.data.attempts).toBe(2);
    const next = (call.data.nextAttemptAt as Date).getTime();
    expect(next).toBeGreaterThanOrEqual(before + 15 * 60 * 1000 - 100);
  });

  it('attempt 3 fail → DEAD + Slack alert critical', async () => {
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({
      ...baseRow, status: 'FAILED', attempts: 2,
    } as never);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('persistent fail'));
    vi.mocked(prisma.emailDelivery.update).mockResolvedValueOnce({} as never);

    const r = await processDelivery('del_1');
    expect(r.sent).toBe(false);
    const call = vi.mocked(prisma.emailDelivery.update).mock.calls[0][0];
    expect(call.data.status).toBe('DEAD');
    expect(call.data.attempts).toBe(3);
    expect(call.data.nextAttemptAt).toBeNull();

    expect(sendCriticalAlert).toHaveBeenCalledOnce();
    const alert = vi.mocked(sendCriticalAlert).mock.calls[0][0];
    expect(alert.severity).toBe('critical');
    expect(alert.title).toContain('DEAD');
  });

  it('skip si delivery already SENT', async () => {
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({
      ...baseRow, status: 'SENT', attempts: 1, sentAt: new Date(),
    } as never);
    const r = await processDelivery('del_1');
    expect(r.sent).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.emailDelivery.update).not.toHaveBeenCalled();
  });

  it('skip si delivery DEAD (no zombie retries)', async () => {
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({
      ...baseRow, status: 'DEAD', attempts: 3,
    } as never);
    const r = await processDelivery('del_1');
    expect(r.sent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('returns sent=false sans crash si delivery introuvable', async () => {
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce(null);
    const r = await processDelivery('del_does_not_exist');
    expect(r.sent).toBe(false);
  });
});

describe('getEmailsReadyForRetry', () => {
  it('query : FAILED ready retry OR PROCESSING stuck > 30min', async () => {
    // Round 17 #3 : la query inclut maintenant les PROCESSING stuck
    // (cron run précédent a crashé après le claim atomique).
    vi.mocked(prisma.emailDelivery.findMany).mockResolvedValueOnce([
      { id: 'a' }, { id: 'b' },
    ] as never);
    const result = await getEmailsReadyForRetry(50);
    expect(result).toHaveLength(2);
    const call = vi.mocked(prisma.emailDelivery.findMany).mock.calls[0]![0]!;
    expect(call.take).toBe(50);
    const orClauses = call.where?.OR as Array<{ status: string }>;
    expect(orClauses).toHaveLength(2);
    expect(orClauses.map((c) => c.status)).toEqual(
      expect.arrayContaining(['FAILED', 'PROCESSING']),
    );
  });
});
