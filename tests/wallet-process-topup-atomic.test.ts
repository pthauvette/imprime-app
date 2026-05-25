/**
 * Tests pour processWalletTopup atomicité — Round 37 #1.
 *
 * Avant : 2 recordWalletTx séparés (TOPUP puis TOPUP_BONUS), chacun sa
 * propre $transaction. Si BONUS fail (DB blip), TOPUP était committed mais
 * BONUS perdu → user payait pour le bonus tier mais ne le recevait pas.
 *
 * Maintenant : 1 seul $transaction wrap les 2 inserts. Si BONUS fail,
 * TOPUP rollback aussi → atomic, ledger consistant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock $transaction(callback) qui call le callback avec un mock tx
const txMock = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  walletTransaction: { create: vi.fn() },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock)),
  },
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { logEmail: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { prisma } from '@/lib/db';
import { processWalletTopup } from '@/lib/wallet/operations';

beforeEach(() => {
  vi.clearAllMocks();
  txMock.user.findUnique.mockResolvedValue({ walletCents: 0 });
  txMock.user.update.mockResolvedValue({});
  txMock.walletTransaction.create.mockResolvedValue({ id: 'wtx_test' });
});

describe('processWalletTopup atomicity (Round 37 #1)', () => {
  it('topup + bonus → 1 seul $transaction, 2 inserts walletTransaction', async () => {
    await processWalletTopup({
      userId: 'u_test',
      amountCents: 10000,
      paymentIntentId: 'pi_test',
      bonusCents: 500,
      tierLabel: 'Tier 50',
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(txMock.walletTransaction.create).toHaveBeenCalledTimes(2);

    // Vérif TOPUP
    const topupArgs = txMock.walletTransaction.create.mock.calls[0]![0];
    expect(topupArgs.data.kind).toBe('TOPUP');
    expect(topupArgs.data.amountCents).toBe(10000);
    expect(topupArgs.data.balanceAfterCents).toBe(10000); // 0 + 10000

    // Vérif TOPUP_BONUS
    const bonusArgs = txMock.walletTransaction.create.mock.calls[1]![0];
    expect(bonusArgs.data.kind).toBe('TOPUP_BONUS');
    expect(bonusArgs.data.amountCents).toBe(500);
    expect(bonusArgs.data.balanceAfterCents).toBe(10500); // 10000 + 500
  });

  it('topup sans bonus → 1 insert TOPUP seulement', async () => {
    await processWalletTopup({
      userId: 'u_test',
      amountCents: 5000,
      paymentIntentId: 'pi_test',
      bonusCents: 0,
      tierLabel: null,
    });

    expect(txMock.walletTransaction.create).toHaveBeenCalledOnce();
    const args = txMock.walletTransaction.create.mock.calls[0]![0];
    expect(args.data.kind).toBe('TOPUP');
  });

  it('bonus présent mais tierLabel null → pas de TOPUP_BONUS (defensive)', async () => {
    await processWalletTopup({
      userId: 'u_test',
      amountCents: 5000,
      paymentIntentId: 'pi_test',
      bonusCents: 500,
      tierLabel: null, // pas de label → pas de bonus
    });

    expect(txMock.walletTransaction.create).toHaveBeenCalledOnce();
    expect(txMock.walletTransaction.create.mock.calls[0]![0].data.kind).toBe('TOPUP');
  });

  it('BONUS insert fail → toute la tx rollback (TOPUP perdu aussi, $transaction throw)', async () => {
    // Premier insert OK (TOPUP), second throw (BONUS)
    txMock.walletTransaction.create
      .mockResolvedValueOnce({ id: 'wtx_topup' })
      .mockRejectedValueOnce(new Error('DB blip on bonus'));

    await expect(
      processWalletTopup({
        userId: 'u_test',
        amountCents: 10000,
        paymentIntentId: 'pi_test',
        bonusCents: 500,
        tierLabel: 'Tier 50',
      }),
    ).rejects.toThrow(/DB blip/);

    // En vrai prod, $transaction rollback le 1er insert. Le mock ne simule
    // pas le rollback (responsabilité Prisma+Postgres), mais on confirme
    // que la promise rejette → caller voit le fail et peut retry.
  });

  it('user introuvable → throw + pas de side effect', async () => {
    txMock.user.findUnique.mockResolvedValue(null);

    await expect(
      processWalletTopup({
        userId: 'u_missing',
        amountCents: 5000,
        paymentIntentId: 'pi_test',
        bonusCents: 0,
        tierLabel: null,
      }),
    ).rejects.toThrow(/introuvable/i);

    expect(txMock.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('return value : totalCreditCents + balanceAfterCents', async () => {
    txMock.user.findUnique.mockResolvedValue({ walletCents: 1000 });

    const result = await processWalletTopup({
      userId: 'u_test',
      amountCents: 10000,
      paymentIntentId: 'pi_test',
      bonusCents: 500,
      tierLabel: 'Tier 50',
    });

    expect(result.totalCreditCents).toBe(10500);
    expect(result.balanceAfterCents).toBe(11500); // 1000 + 10000 + 500
  });

  it('description tronquée à 500 chars (DB column limit defensive)', async () => {
    await processWalletTopup({
      userId: 'u_test',
      amountCents: 10000,
      paymentIntentId: 'pi_test',
      bonusCents: 500,
      tierLabel: 'x'.repeat(600), // tier label énorme
    });
    const bonusArgs = txMock.walletTransaction.create.mock.calls[1]![0];
    expect(bonusArgs.data.description.length).toBeLessThanOrEqual(500);
  });
});
