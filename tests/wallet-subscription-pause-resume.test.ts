/**
 * Tests pour POST /api/wallet/subscription/{pause,resume} — Round 28 #5.
 *
 * Lock-in :
 *   - 401 si pas auth
 *   - 404 si pas de sub active (Stripe-side ID null)
 *   - 200 + idempotent : pause sur déjà-paused → no-op
 *   - Stripe subscriptions.update appelé avec pause_collection correct
 *   - User row updaté avec walletAutoRenewPausedAt = now (pause) / null (resume)
 *   - Stripe throw → 500 + pas d'update DB (cohérence)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub, logEmail: stub };
});

const stripeUpdate = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({}));
vi.mock('stripe', () => {
  class StripeMock {
    subscriptions = { update: (...args: unknown[]) => stripeUpdate(...args) };
  }
  return { default: StripeMock };
});

import { prisma } from '@/lib/db';
import { auth } from '@/auth';

function session() {
  return { user: { id: 'user_1', email: 'me@plio.ca', role: 'USER' } };
}

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  process.env = { ...ORIG_ENV, STRIPE_SECRET_KEY: 'sk_test_fake' };
  vi.mocked(prisma.user.update).mockResolvedValue({} as never);
  stripeUpdate.mockResolvedValue({} as never);
});

describe('POST /api/wallet/subscription/pause (Round 28 #5)', () => {
  it('401 si pas auth', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const { POST } = await import('@/app/api/wallet/subscription/pause/route');
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('404 si pas de sub Stripe active', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      walletAutoRenewStripeSubId: null,
      walletAutoRenewPausedAt: null,
    } as never);
    const { POST } = await import('@/app/api/wallet/subscription/pause/route');
    const res = await POST();
    expect(res.status).toBe(404);
    expect(stripeUpdate).not.toHaveBeenCalled();
  });

  it('200 + alreadyPaused si déjà paused (idempotent no-op)', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      walletAutoRenewStripeSubId: 'sub_x',
      walletAutoRenewPausedAt: new Date(),
    } as never);
    const { POST } = await import('@/app/api/wallet/subscription/pause/route');
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadyPaused).toBe(true);
    expect(stripeUpdate).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('200 + pause Stripe avec mark_uncollectible behavior', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      walletAutoRenewStripeSubId: 'sub_x',
      walletAutoRenewPausedAt: null,
    } as never);
    const { POST } = await import('@/app/api/wallet/subscription/pause/route');
    const res = await POST();
    expect(res.status).toBe(200);

    expect(stripeUpdate).toHaveBeenCalledOnce();
    const args = stripeUpdate.mock.calls[0]!;
    expect(args[0]).toBe('sub_x');
    expect(args[1]).toMatchObject({
      pause_collection: { behavior: 'mark_uncollectible' },
    });

    // DB updated avec timestamp
    expect(prisma.user.update).toHaveBeenCalledOnce();
    const updArgs = vi.mocked(prisma.user.update).mock.calls[0]![0];
    expect(updArgs.where).toEqual({ id: 'user_1' });
    expect((updArgs.data as { walletAutoRenewPausedAt: Date }).walletAutoRenewPausedAt).toBeInstanceOf(Date);
  });

  it('500 + DB pas updated si Stripe throw (cohérence rollback)', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      walletAutoRenewStripeSubId: 'sub_x',
      walletAutoRenewPausedAt: null,
    } as never);
    stripeUpdate.mockRejectedValueOnce(new Error('Stripe down'));
    const { POST } = await import('@/app/api/wallet/subscription/pause/route');
    const res = await POST();
    expect(res.status).toBe(500);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/wallet/subscription/resume (Round 28 #5)', () => {
  it('401 si pas auth', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const { POST } = await import('@/app/api/wallet/subscription/resume/route');
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('404 si pas de sub configurée', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      walletAutoRenewStripeSubId: null,
      walletAutoRenewPausedAt: null,
    } as never);
    const { POST } = await import('@/app/api/wallet/subscription/resume/route');
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it('200 + alreadyActive si pas paused (idempotent no-op)', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      walletAutoRenewStripeSubId: 'sub_x',
      walletAutoRenewPausedAt: null,
    } as never);
    const { POST } = await import('@/app/api/wallet/subscription/resume/route');
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alreadyActive).toBe(true);
    expect(stripeUpdate).not.toHaveBeenCalled();
  });

  it('200 + clear pause_collection: null + DB walletAutoRenewPausedAt = null', async () => {
    vi.mocked(auth).mockResolvedValue(session() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      walletAutoRenewStripeSubId: 'sub_x',
      walletAutoRenewPausedAt: new Date('2026-01-01'),
    } as never);
    const { POST } = await import('@/app/api/wallet/subscription/resume/route');
    const res = await POST();
    expect(res.status).toBe(200);

    expect(stripeUpdate).toHaveBeenCalledOnce();
    const args = stripeUpdate.mock.calls[0]!;
    expect(args[0]).toBe('sub_x');
    expect(args[1]).toMatchObject({ pause_collection: null });

    const updArgs = vi.mocked(prisma.user.update).mock.calls[0]![0];
    expect(updArgs.data).toMatchObject({ walletAutoRenewPausedAt: null });
  });
});
