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
// Round 38 #4 — Tests mis à jour pour le refactor optimistic locking :
// `update` → `updateMany` (returns {count}) + re-fetch via findUnique.
const txOrder = { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() };
const txOrderEvent = { create: vi.fn() };
const txUser = { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
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
  // Round 38 #4 — updateMany return {count:1} by default (status guard
  // passed). Tests of overdraft + replay use count:0 explicitly.
  txOrder.update.mockResolvedValue({ id: 'o_test', status: 'PAID' });
  txOrder.updateMany.mockResolvedValue({ count: 1 });
  txOrder.findUnique.mockResolvedValue({ id: 'o_test', status: 'PAID' });
  txOrderEvent.create.mockResolvedValue({});
  txUser.findUnique.mockResolvedValue({ walletCents: 5000 });
  txUser.update.mockResolvedValue({});
  txUser.updateMany.mockResolvedValue({ count: 1 });
  txWalletTransaction.create.mockResolvedValue({ id: 'wtx_1' });
});

describe('markOrderPaidWithWalletDebit (Round 36 #1 + Round 38 #4 optimistic locking)', () => {
  it('sans walletDebit → updateMany Order (status guard) + create OrderEvent dans 1 tx', async () => {
    await markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_123' });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(txOrder.updateMany).toHaveBeenCalledOnce();
    expect(txOrderEvent.create).toHaveBeenCalledOnce();
    expect(txUser.updateMany).not.toHaveBeenCalled();
    expect(txWalletTransaction.create).not.toHaveBeenCalled();

    // Round 38 #4 — guard WHERE status = 'PENDING'
    const updateArgs = txOrder.updateMany.mock.calls[0]![0];
    expect(updateArgs.where.status).toBe('PENDING');
  });

  it('avec walletDebit → updateMany ×2 (order + user) + create event + walletTx', async () => {
    txUser.findUnique.mockResolvedValue({ walletCents: 3500 }); // après le decrement de 1500

    await markOrderPaidWithWalletDebit({
      paymentIntentId: 'pi_123',
      walletDebit: {
        userId: 'u_owner',
        amountCents: 1500,
        description: 'Order #ABC — wallet applied',
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(txOrder.updateMany).toHaveBeenCalledOnce();
    expect(txOrderEvent.create).toHaveBeenCalledOnce();
    expect(txUser.updateMany).toHaveBeenCalledOnce();
    expect(txWalletTransaction.create).toHaveBeenCalledOnce();

    // Round 38 #3 — wallet updateMany utilise WHERE walletCents >= amount
    const walletUpdateArgs = txUser.updateMany.mock.calls[0]![0];
    expect(walletUpdateArgs.where.walletCents).toEqual({ gte: 1500 });
    expect(walletUpdateArgs.data.walletCents).toEqual({ decrement: 1500 });

    // Verify wallet ledger row signed negative
    const walletTxArgs = txWalletTransaction.create.mock.calls[0]![0];
    expect(walletTxArgs.data.amountCents).toBe(-1500);
    expect(walletTxArgs.data.kind).toBe('ORDER_SPEND');
    expect(walletTxArgs.data.balanceAfterCents).toBe(3500); // post-decrement
  });

  it('Round 38 #4 — replay (order déjà PAID) → updateMany count=0, idempotent skip', async () => {
    // Status guard manqué = order déjà PAID (webhook replay)
    txOrder.updateMany.mockResolvedValue({ count: 0 });
    txOrder.findUnique.mockResolvedValue({ id: 'o_test', status: 'PAID' });

    const result = await markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_123' });

    expect(result).toBeDefined();
    // Aucun side effect : ni event ni wallet
    expect(txOrderEvent.create).not.toHaveBeenCalled();
    expect(txUser.updateMany).not.toHaveBeenCalled();
    expect(txWalletTransaction.create).not.toHaveBeenCalled();
  });

  it('overdraft (wallet 100 < debit 500) → throw + ledger non écrit', async () => {
    // Order guard passes (count:1) mais wallet guard fail
    txOrder.updateMany.mockResolvedValue({ count: 1 });
    txUser.updateMany.mockResolvedValue({ count: 0 }); // guard fail
    txUser.findUnique.mockResolvedValue({ walletCents: 100 });

    await expect(
      markOrderPaidWithWalletDebit({
        paymentIntentId: 'pi_123',
        walletDebit: { userId: 'u_owner', amountCents: 500, description: 'overdraft test' },
      }),
    ).rejects.toThrow(/overdraft/i);

    expect(txWalletTransaction.create).not.toHaveBeenCalled();
  });

  it('amountCents = 0 → skip wallet flow (defensive)', async () => {
    await markOrderPaidWithWalletDebit({
      paymentIntentId: 'pi_123',
      walletDebit: { userId: 'u_owner', amountCents: 0, description: 'zero amount' },
    });

    expect(txOrder.updateMany).toHaveBeenCalledOnce();
    expect(txUser.updateMany).not.toHaveBeenCalled();
    expect(txWalletTransaction.create).not.toHaveBeenCalled();
  });

  it('paymentIntentId introuvable → OrderNotFoundError', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

    await expect(
      markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_unknown' }),
    ).rejects.toThrow(OrderNotFoundError);
  });

  it('User introuvable au moment du wallet debit → throw', async () => {
    // Order guard passes, wallet updateMany count=0 + user lookup returns null
    txUser.updateMany.mockResolvedValue({ count: 0 });
    txUser.findUnique.mockResolvedValue(null);

    await expect(
      markOrderPaidWithWalletDebit({
        paymentIntentId: 'pi_123',
        walletDebit: { userId: 'u_missing', amountCents: 100, description: 'orphan user' },
      }),
    ).rejects.toThrow(/introuvable/i);
  });

  it('description tronquée à 500 chars (DB-level enforce)', async () => {
    txUser.findUnique.mockResolvedValue({ walletCents: 3000 });

    const longDesc = 'x'.repeat(600);
    await markOrderPaidWithWalletDebit({
      paymentIntentId: 'pi_123',
      walletDebit: { userId: 'u_owner', amountCents: 100, description: longDesc },
    });
    const walletTxArgs = txWalletTransaction.create.mock.calls[0]![0];
    expect(walletTxArgs.data.description).toHaveLength(500);
  });
});
