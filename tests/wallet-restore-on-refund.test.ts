/**
 * restoreWalletCreditOnFullRefund — helper partagé de restauration du crédit
 * wallet sur full refund (Audit v2 #1.2/#1.4, extrait de Round 37 #1).
 *
 * Verrouille les invariants MONEY : (1) no-op si pas de crédit wallet,
 * (2) IDEMPOTENT (ne re-crédite jamais si un REFUND existe déjà — safe pour le
 * retry webhook + double-clic admin), (3) non-fatal (un échec de restauration
 * alerte mais ne throw pas — le refund Stripe a déjà réussi), (4) Audit 2026-07 #3
 * ATOMIQUE sous verrou (FOR UPDATE) → anti double-crédit sous concurrence
 * (cron restore-compensation en overlap / double-clic admin).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const txMock = {
  $queryRaw: vi.fn(async () => [{ id: 'u_1' }]),
  walletTransaction: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 'wtx_1' })),
  },
  user: { update: vi.fn(async () => ({ walletCents: 7000 })) },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    walletTransaction: { findFirst: vi.fn() },
    orderEvent: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
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
  vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValue(null as never);
  txMock.$queryRaw.mockResolvedValue([{ id: 'u_1' }] as never);
  txMock.walletTransaction.findFirst.mockResolvedValue(null as never);
  txMock.walletTransaction.create.mockResolvedValue({ id: 'wtx_1' } as never);
  txMock.user.update.mockResolvedValue({ walletCents: 7000 } as never);
});

describe('restoreWalletCreditOnFullRefund', () => {
  it('aucun crédit wallet appliqué → no-op (0), aucune query', async () => {
    const r = await restoreWalletCreditOnFullRefund({ order: { ...ORDER, walletCreditAppliedCents: 0 } });
    expect(r).toBe(0);
    expect(prisma.walletTransaction.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('IDEMPOTENT (fast-path hors verrou) : un REFUND wallet existe déjà → no-op (0), pas de tx', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValueOnce({ id: 'existing' } as never);
    const r = await restoreWalletCreditOnFullRefund({ order: ORDER });
    expect(r).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.walletTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'o_1', kind: 'REFUND' } }),
    );
  });

  it('restaure le crédit SOUS VERROU (FOR UPDATE) : montant POSITIF, kind REFUND, balance snapshot', async () => {
    const r = await restoreWalletCreditOnFullRefund({ order: ORDER, actorId: 'admin_1', refundId: 're_1' });
    expect(r).toBe(2000);
    // verrou pessimiste émis (sérialise les restaurations concurrentes du même user)
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txMock.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'REFUND',
          amountCents: 2000, // positif = credit back
          orderId: 'o_1',
          adminId: 'admin_1',
          balanceAfterCents: 7000,
        }),
      }),
    );
  });

  it('ANTI-COURSE : un REFUND est apparu SOUS verrou (run concurrent) → no-op, AUCUN double-crédit', async () => {
    // Fast-path voit « rien », mais un run concurrent a committé avant qu'on prenne le verrou.
    txMock.walletTransaction.findFirst.mockResolvedValueOnce({ id: 'raced' } as never);
    const r = await restoreWalletCreditOnFullRefund({ order: ORDER, refundId: 're_1' });
    expect(r).toBe(0);
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1); // le verrou A été pris
    expect(txMock.user.update).not.toHaveBeenCalled(); // mais AUCUN crédit
    expect(txMock.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('NON-FATAL : si la restauration throw → retourne 0 + alerte critique (ne throw pas)', async () => {
    txMock.user.update.mockRejectedValueOnce(new Error('DB down') as never);
    const r = await restoreWalletCreditOnFullRefund({ order: ORDER, refundId: 're_x' });
    expect(r).toBe(0);
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
    expect(sendCriticalAlert).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical' }));
  });

  it('cron (suppressAlert) : échec → PAS d\'alerte par-appel (le cron escalade lui-même)', async () => {
    txMock.user.update.mockRejectedValueOnce(new Error('DB down') as never);
    const r = await restoreWalletCreditOnFullRefund({ order: ORDER, refundId: 're_x', suppressAlert: true });
    expect(r).toBe(0);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });
});
