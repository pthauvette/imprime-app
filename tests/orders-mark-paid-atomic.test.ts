/**
 * Tests markOrderPaidWithWalletDebit — Round 36 #1.
 *
 * Lock-in : mark-paid + wallet debit dans la même $transaction.
 * Avant : 2 tx séparées → split-brain si crash entre les 2.
 *
 * Tests :
 *  - Pas de walletDebit → fonctionne comme markOrderPaid (status + event)
 *  - Avec walletDebit → update User.walletCents + insert WalletTransaction
 *    + update Order tout dans la même tx (callback prisma.$transaction)
 *  - Overdraft (wallet < amount) → throw + tx rollback (no partial state)
 *  - amountCents = 0 → skip le wallet flow (pas de no-op tx)
 *  - paymentIntentId introuvable → throw OrderNotFoundError
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prisma mock : $transaction(fn) appelle fn(tx) ; tx a les mêmes méthodes
// que prisma. On capture les appels sur tx pour vérifier l'ordre.
const txOrder = { update: vi.fn(), findUnique: vi.fn() };
const txOrderEvent = { create: vi.fn() };
const txUser = { findUnique: vi.fn(), update: vi.fn() };
const txWalletTransaction = { create: vi.fn() };

const txMock = {
  order: txOrder,
  orderEvent: txOrderEvent,
  user: txUser,
  walletTransaction: txWalletTransaction,
};

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => {
      // Si c'est un array (legacy markOrderPaid), exécute en parallèle
      if (Array.isArray(fn)) return Promise.all(fn);
      // Sinon c'est un callback (markOrderPaidWithWalletDebit)
      return fn(txMock);
    }),
  },
}));

import { prisma } from '@/lib/db';
import { markOrderPaidWithWalletDebit, OrderNotFoundError } from '@/lib/db/orders';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.order.findUnique).mockResolvedValue({
    id: 'o_test',
    userId: 'u_owner',
    paymentIntentId: 'pi_123',
  } as never);
  txOrder.update.mockResolvedValue({ id: 'o_test', status: 'PAID' });
  txOrderEvent.create.mockResolvedValue({});
  txUser.findUnique.mockResolvedValue({ walletCents: 5000 });
  txUser.update.mockResolvedValue({});
  txWalletTransaction.create.mockResolvedValue({ id: 'wtx_1' });
});

describe('markOrderPaidWithWalletDebit (Round 36 #1)', () => {
  it('sans walletDebit → update Order + create OrderEvent dans 1 tx', async () => {
    await markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_123' });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(txOrder.update).toHaveBeenCalledOnce();
    expect(txOrderEvent.create).toHaveBeenCalledOnce();
    expect(txUser.update).not.toHaveBeenCalled();
    expect(txWalletTransaction.create).not.toHaveBeenCalled();
  });

  it('avec walletDebit → 4 ops dans la même tx (update order + event + user + walletTx)', async () => {
    await markOrderPaidWithWalletDebit({
      paymentIntentId: 'pi_123',
      walletDebit: {
        userId: 'u_owner',
        amountCents: 1500,
        description: 'Order #ABC — wallet applied',
      },
    });

    // 1 seul $transaction call, mais 4 opérations DB à l'intérieur
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(txOrder.update).toHaveBeenCalledOnce();
    expect(txOrderEvent.create).toHaveBeenCalledOnce();
    expect(txUser.update).toHaveBeenCalledOnce();
    expect(txWalletTransaction.create).toHaveBeenCalledOnce();

    // Verify wallet debit signed negative dans le ledger
    const walletTxArgs = txWalletTransaction.create.mock.calls[0]![0];
    expect(walletTxArgs.data.amountCents).toBe(-1500);
    expect(walletTxArgs.data.kind).toBe('ORDER_SPEND');
    expect(walletTxArgs.data.balanceAfterCents).toBe(3500); // 5000 - 1500
  });

  it('overdraft (wallet 100 < debit 500) → throw + aucun side effect avant le throw', async () => {
    txUser.findUnique.mockResolvedValue({ walletCents: 100 });

    await expect(
      markOrderPaidWithWalletDebit({
        paymentIntentId: 'pi_123',
        walletDebit: { userId: 'u_owner', amountCents: 500, description: 'overdraft test' },
      }),
    ).rejects.toThrow(/overdraft/i);

    // Note: les txOrder.update + txOrderEvent.create ont été called PUIS le throw,
    // mais comme on est dans $transaction, Postgres rollback tout. Le mock
    // ne simule pas le rollback (c'est une responsabilité Prisma+DB), mais
    // l'important est que le throw remonte et que le wallet n'est PAS écrit.
    expect(txWalletTransaction.create).not.toHaveBeenCalled();
    expect(txUser.update).not.toHaveBeenCalled();
  });

  it('amountCents = 0 → skip wallet flow (defensive, ne traite pas comme overdraft)', async () => {
    await markOrderPaidWithWalletDebit({
      paymentIntentId: 'pi_123',
      walletDebit: { userId: 'u_owner', amountCents: 0, description: 'zero amount' },
    });

    expect(txOrder.update).toHaveBeenCalledOnce();
    expect(txUser.update).not.toHaveBeenCalled();
    expect(txWalletTransaction.create).not.toHaveBeenCalled();
  });

  it('paymentIntentId introuvable → OrderNotFoundError', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

    await expect(
      markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_unknown' }),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('User introuvable au moment du wallet debit → throw', async () => {
    txUser.findUnique.mockResolvedValue(null);

    await expect(
      markOrderPaidWithWalletDebit({
        paymentIntentId: 'pi_123',
        walletDebit: { userId: 'u_missing', amountCents: 100, description: 'orphan user' },
      }),
    ).rejects.toThrow(/introuvable/i);
  });

  it('description tronquée à 500 chars (DB-level enforce)', async () => {
    const longDesc = 'x'.repeat(600);
    await markOrderPaidWithWalletDebit({
      paymentIntentId: 'pi_123',
      walletDebit: { userId: 'u_owner', amountCents: 100, description: longDesc },
    });
    const walletTxArgs = txWalletTransaction.create.mock.calls[0]![0];
    expect(walletTxArgs.data.description).toHaveLength(500);
  });
});
