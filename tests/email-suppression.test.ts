/**
 * Tests src/lib/emails/suppression.ts — Round 39 #4.
 *
 * Lock-in : isSuppressed normalise (lowercase+trim), suppressEmail upsert
 * (création si nouveau, update si existant). Empty email = no-op safe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    emailSuppression: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { prisma } from '@/lib/db';
import { isSuppressed, suppressEmail } from '@/lib/emails/suppression';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('isSuppressed', () => {
  it('returns false si row inexistante', async () => {
    vi.mocked(prisma.emailSuppression.findUnique).mockResolvedValue(null);
    expect(await isSuppressed('foo@bar.ca')).toBe(false);
  });

  it('returns true si row existante', async () => {
    vi.mocked(prisma.emailSuppression.findUnique).mockResolvedValue({ id: 'sup1' } as never);
    expect(await isSuppressed('foo@bar.ca')).toBe(true);
  });

  it('normalise lowercase + trim avant query', async () => {
    vi.mocked(prisma.emailSuppression.findUnique).mockResolvedValue(null);
    await isSuppressed('  FOO@BAR.CA  ');
    const args = vi.mocked(prisma.emailSuppression.findUnique).mock.calls[0]![0];
    expect(args.where).toEqual({ email: 'foo@bar.ca' });
  });

  it('empty string → false sans query DB', async () => {
    expect(await isSuppressed('   ')).toBe(false);
    expect(prisma.emailSuppression.findUnique).not.toHaveBeenCalled();
  });
});

describe('suppressEmail', () => {
  it('create si email pas encore dans la table', async () => {
    vi.mocked(prisma.emailSuppression.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.emailSuppression.create).mockResolvedValue({ id: 'new' } as never);

    const res = await suppressEmail({
      email: 'fresh@plio.ca',
      reason: 'HARD_BOUNCE',
      source: 'SES_BOUNCE',
      sesMessageId: 'ses-msg-1',
      details: '{"bounceType":"Permanent"}',
    });

    expect(res.created).toBe(true);
    expect(prisma.emailSuppression.create).toHaveBeenCalledTimes(1);
    expect(prisma.emailSuppression.update).not.toHaveBeenCalled();
    const createArgs = vi.mocked(prisma.emailSuppression.create).mock.calls[0]![0];
    expect(createArgs.data.email).toBe('fresh@plio.ca');
    expect(createArgs.data.reason).toBe('HARD_BOUNCE');
  });

  it('update si email déjà existante (idempotent SNS replay)', async () => {
    vi.mocked(prisma.emailSuppression.findUnique).mockResolvedValue({
      id: 'existing-id', reason: 'HARD_BOUNCE',
    } as never);
    vi.mocked(prisma.emailSuppression.update).mockResolvedValue({} as never);

    const res = await suppressEmail({
      email: 'repeat@plio.ca',
      reason: 'COMPLAINT',
      source: 'SES_COMPLAINT',
    });

    expect(res.created).toBe(false);
    expect(prisma.emailSuppression.update).toHaveBeenCalledTimes(1);
    expect(prisma.emailSuppression.create).not.toHaveBeenCalled();
  });

  it('normalise email avant INSERT', async () => {
    vi.mocked(prisma.emailSuppression.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.emailSuppression.create).mockResolvedValue({ id: 'x' } as never);
    await suppressEmail({ email: '  UPPER@PLIO.CA  ', reason: 'HARD_BOUNCE', source: 'SES_BOUNCE' });
    const args = vi.mocked(prisma.emailSuppression.create).mock.calls[0]![0];
    expect(args.data.email).toBe('upper@plio.ca');
  });

  it('empty email → no-op (pas de DB call)', async () => {
    const res = await suppressEmail({ email: '   ', reason: 'MANUAL', source: 'ADMIN' });
    expect(res.created).toBe(false);
    expect(prisma.emailSuppression.create).not.toHaveBeenCalled();
    expect(prisma.emailSuppression.update).not.toHaveBeenCalled();
  });
});
