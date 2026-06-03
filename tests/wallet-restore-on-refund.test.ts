/**
 * restoreWalletCreditOnFullRefund — helper partagé de restauration du crédit
 * wallet sur full refund (Audit v2 #1.2/#1.4, extrait de Round 37 #1).
 *
 * Verrouille les invariants MONEY : (1) no-op si pas de crédit wallet,
 * (2) IDEMPOTENT (ne re-crédite jamais si un REFUND existe déjà — safe pour le
 * retry webhook + double-clic admin), (3) non-fatal (un échec de restauration
 * alerte mais ne throw pas — le refund Stripe a déjà réussi).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const txMock = {
  user: {
    updateMany: vi.fn(async () => ({ count: 1 })),
    findUnique: vi.fn(async () => ({ walletCents: 5000 })),
  },
  walletTransaction: { create: vi.fn(async () => ({ id: 'wtx_1' })) },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    walletTransaction: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock)),
  },
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return {
    logEmail: { info: noop, warn: noop, error: noop },
    logStripe: { info: noop, warn: noop, error: noop },
  };
});
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert: vi.fn(async () => true) }));

import { prisma } from '@/lib/db';
import { restoreWalletCreditOnFullRefund } from '@/lib/wallet/operations';
import { sendCriticalAlert } from '@/lib/alerting/slack';

const ORDER = { id: 'o_1', userId: 'u_1', walletCreditAppliedCents: 2000 };

beforeEach(() => {
  vi.clearAllMocks();
  txMock.user.updateMany.mockResolvedValue({ count: 1 } as never);
  txMock.user.findUnique.mockResolvedValue({ walletCents: 5000 } as never);
  txMock.walletTransaction.create.mockResolvedValue({ id: 'wtx_1' } as never);
});

describe('restoreWalletCreditOnFullRefund', () => {
  it('aucun crédit wallet appliqué → no-op (0), aucune query', async () => {
    const r = await restoreWalletCreditOnFullRefund({ order: { ...ORDER, walletCreditAppliedCents: 0 } });
    expect(r).toBe(0);
    expect(prisma.walletTransaction.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('IDEMPOTENT : un REFUND wallet existe déjà → no-op (0), pas de re-crédit', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValueOnce({ id: 'existing' } as never);
    const r = await restoreWalletCreditOnFullRefund({ order: ORDER });
    expect(r).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // garde scopée à la commande + kind REFUND
    expect(prisma.walletTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'o_1', kind: 'REFUND' } }),
    );
  });

  it('restaure le crédit (montant POSITIF, kind REFUND) si pas déjà fait', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValueOnce(null as never);
    const r = await restoreWalletCreditOnFullRefund({ order: ORDER, actorId: 'admin_1', refundId: 're_1' });
    expect(r).toBe(2000);
    expect(txMock.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'REFUND',
          amountCents: 2000, // positif = credit back
          orderId: 'o_1',
          adminId: 'admin_1',
        }),
      }),
    );
  });

  it('NON-FATAL : si la restauration throw → retourne 0 + alerte critique (ne throw pas)', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValueOnce(null as never);
    // recordWalletTx CREDIT path : updateMany count=0 → throw « User introuvable »
    txMock.user.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    const r = await restoreWalletCreditOnFullRefund({ order: ORDER, refundId: 're_x' });
    expect(r).toBe(0);
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
    expect(sendCriticalAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical' }),
    );
  });
});
