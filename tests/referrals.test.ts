/**
 * Tests pour lib/referrals/code.ts + lib/referrals/award.ts.
 *
 * Focus :
 *  - ensureReferralCode : génère si absent, retourne existant si présent,
 *    retry sur collision
 *  - findReferrerByCode : normalise + valide longueur
 *  - awardReferralCreditIfEligible : idempotence (refereeUserId unique),
 *    skip si pas referredByCode, skip si self-referral, skip si > 1ère
 *    commande payée, transaction atomique en succès
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    referralReward: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    order: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';
import { ensureReferralCode, findReferrerByCode, buildShareUrl } from '@/lib/referrals/code';
import { awardReferralCreditIfEligible } from '@/lib/referrals/award';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ensureReferralCode', () => {
  it('retourne le code existant si déjà set', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', referralCode: 'SOPHIE7H4N', firstName: 'Sophie', name: null, email: 's@p.ca',
    } as never);
    const code = await ensureReferralCode('u1');
    expect(code).toBe('SOPHIE7H4N');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('génère depuis firstName si pas de code', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', referralCode: null, firstName: 'Sophie', name: null, email: 's@p.ca',
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
    const code = await ensureReferralCode('u1');
    expect(code).toMatch(/^SOPHIE[A-Z0-9]{4}$/);
  });

  it('fallback email prefix si pas de firstName', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', referralCode: null, firstName: null, name: null, email: 'patrickt@plio.ca',
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
    const code = await ensureReferralCode('u1');
    expect(code).toMatch(/^PATRICK[A-Z0-9]{4}$/);
  });

  it('throw si user introuvable', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    await expect(ensureReferralCode('u_missing')).rejects.toThrow(/introuvable/);
  });
});

describe('findReferrerByCode', () => {
  it('null si code trop court (< 5)', async () => {
    const r = await findReferrerByCode('ABC');
    expect(r).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('null si code trop long (> 20)', async () => {
    const r = await findReferrerByCode('A'.repeat(25));
    expect(r).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('normalise en upper + trim avant lookup', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'u_ref' } as never);
    const r = await findReferrerByCode('  sophie7h4n  ');
    expect(r).toEqual({ id: 'u_ref' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { referralCode: 'SOPHIE7H4N' },
      select: { id: true },
    });
  });
});

describe('buildShareUrl', () => {
  it('encode le code dans le param ref', () => {
    expect(buildShareUrl('TEST1234', 'https://plio.ca')).toBe('https://plio.ca?ref=TEST1234');
  });
});

describe('awardReferralCreditIfEligible', () => {
  it('skip si user pas trouvé', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    const r = await awardReferralCreditIfEligible({ userId: 'u1', orderId: 'o1' });
    expect(r.awarded).toBe(false);
    expect(r.reason).toBe('user-not-found');
  });

  it('skip si user n\'a pas referredByCode', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', referredByCode: null,
    } as never);
    const r = await awardReferralCreditIfEligible({ userId: 'u1', orderId: 'o1' });
    expect(r.awarded).toBe(false);
    expect(r.reason).toBe('no-referrer');
  });

  it('skip si déjà rewarded (idempotence)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'u1', referredByCode: 'SOPHIE7H4N',
    } as never);
    vi.mocked(prisma.referralReward.findUnique).mockResolvedValueOnce({
      id: 'r1', refereeUserId: 'u1',
    } as never);
    const r = await awardReferralCreditIfEligible({ userId: 'u1', orderId: 'o1' });
    expect(r.awarded).toBe(false);
    expect(r.reason).toBe('already-rewarded');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skip self-referral (rare mais possible)', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'u1', referredByCode: 'PATRICK1234' } as never)
      // findReferrerByCode lookup
      .mockResolvedValueOnce({ id: 'u1' } as never);
    vi.mocked(prisma.referralReward.findUnique).mockResolvedValueOnce(null);
    const r = await awardReferralCreditIfEligible({ userId: 'u1', orderId: 'o1' });
    expect(r.awarded).toBe(false);
    expect(r.reason).toBe('self-referral');
  });

  it('skip si plus de 1 order payée (pas 1ère commande)', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'u1', referredByCode: 'REF12345' } as never)
      .mockResolvedValueOnce({ id: 'u_ref' } as never);
    vi.mocked(prisma.referralReward.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.order.count).mockResolvedValueOnce(5);
    const r = await awardReferralCreditIfEligible({ userId: 'u1', orderId: 'o1' });
    expect(r.awarded).toBe(false);
    expect(r.reason).toBe('not-first-paid-order');
  });

  it('award réussi : créé reward + incrémente les 2 balances en tx', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'u_filleul', referredByCode: 'REF12345' } as never)
      .mockResolvedValueOnce({ id: 'u_ref' } as never);
    vi.mocked(prisma.referralReward.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.order.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.$transaction).mockResolvedValueOnce([{}, {}, {}] as never);

    const r = await awardReferralCreditIfEligible({ userId: 'u_filleul', orderId: 'o_first' });
    expect(r.awarded).toBe(true);
    expect(r.referrerId).toBe('u_ref');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
