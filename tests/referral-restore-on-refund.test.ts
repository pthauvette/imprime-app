/**
 * restoreReferralCreditOnFullRefund — Audit v2 #3.1.
 *
 * Le crédit referral est débité à la confirmation du paiement
 * (markOrderPaidWithWalletDebit). Symétriquement, un full refund/cancel doit le
 * restaurer. Verrouille : (1) no-op si pas de crédit, (2) IDEMPOTENT via le
 * marqueur OrderEvent REFERRAL_CREDIT_RESTORED, (3) restore (increment positif
 * + event), (4) non-fatal (échec → 0 + alerte critique, ne throw pas).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const txMock = {
  user: { update: vi.fn(async () => ({})) },
  orderEvent: { create: vi.fn(async () => ({ id: 'oe_1' })) },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    orderEvent: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock)),
  },
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { logStripe: { info: noop, warn: noop, error: noop } };
});
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert: vi.fn(async () => true) }));

import { prisma } from '@/lib/db';
import { restoreReferralCreditOnFullRefund } from '@/lib/referrals/restore';
import { sendCriticalAlert } from '@/lib/alerting/slack';

const ORDER = { id: 'o_1', userId: 'u_1', referralCreditAppliedCents: 2500 };

beforeEach(() => {
  vi.clearAllMocks();
  txMock.user.update.mockResolvedValue({} as never);
  txMock.orderEvent.create.mockResolvedValue({ id: 'oe_1' } as never);
});

describe('restoreReferralCreditOnFullRefund', () => {
  it('aucun crédit referral appliqué → no-op (0), aucune query', async () => {
    const r = await restoreReferralCreditOnFullRefund({ order: { ...ORDER, referralCreditAppliedCents: 0 } });
    expect(r).toBe(0);
    expect(prisma.orderEvent.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('IDEMPOTENT : un OrderEvent REFERRAL_CREDIT_RESTORED existe déjà → no-op (0)', async () => {
    vi.mocked(prisma.orderEvent.findFirst).mockResolvedValueOnce({ id: 'existing' } as never);
    const r = await restoreReferralCreditOnFullRefund({ order: ORDER });
    expect(r).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.orderEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'o_1', kind: 'REFERRAL_CREDIT_RESTORED' } }),
    );
  });

  it('restaure le crédit (increment POSITIF) + marque l\'OrderEvent', async () => {
    vi.mocked(prisma.orderEvent.findFirst).mockResolvedValueOnce(null as never);
    const r = await restoreReferralCreditOnFullRefund({ order: ORDER, actorId: 'admin_1', refundId: 're_1' });
    expect(r).toBe(2500);
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u_1' },
        data: { referralCreditCents: { increment: 2500 } },
      }),
    );
    expect(txMock.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'REFERRAL_CREDIT_RESTORED' }) }),
    );
  });

  it('NON-FATAL : si la restauration throw → retourne 0 + alerte critique (ne throw pas)', async () => {
    vi.mocked(prisma.orderEvent.findFirst).mockResolvedValueOnce(null as never);
    txMock.user.update.mockRejectedValueOnce(new Error('DB down') as never);
    const r = await restoreReferralCreditOnFullRefund({ order: ORDER, refundId: 're_x' });
    expect(r).toBe(0);
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
    expect(sendCriticalAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical' }),
    );
  });
});
