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

// Audit v2 #5.2 — increment promo gardé via SQL brut (tx.$executeRaw).
const txExecuteRaw = vi.fn(async () => 1);

const txMock = {
  order: txOrder,
  orderEvent: txOrderEvent,
  user: txUser,
  walletTransaction: txWalletTransaction,
  $executeRaw: txExecuteRaw,
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

// Audit v2 #3.3 — l'alerte de clamp wallet part APRÈS commit (import dynamique).
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert: vi.fn(async () => true) }));

import { prisma } from '@/lib/db';
import { markOrderPaidWithWalletDebit, OrderNotFoundError } from '@/lib/db/orders';
import { sendCriticalAlert } from '@/lib/alerting/slack';

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
  txExecuteRaw.mockResolvedValue(1 as never);
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

  it('M2/M3 — NE débite PLUS wallet/referral au webhook (déjà réservé au create)', async () => {
    // Order avec crédits appliqués : le webhook confirme (transition) mais NE re-décrémente
    // PAS le solde (réservé atomiquement à la création via createReservedOrder). Re-débiter
    // double-décrémenterait. `walletDebit` est ignoré.
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o_test', userId: 'u_owner', paymentIntentId: 'pi_123',
      referralCreditAppliedCents: 2500, promoCodeId: null,
    } as never);
    txOrder.updateMany.mockResolvedValue({ count: 1 });

    const result = await markOrderPaidWithWalletDebit({
      paymentIntentId: 'pi_123',
      walletDebit: { userId: 'u_owner', amountCents: 1500, description: 'ignoré' },
    });

    expect(result.transitioned).toBe(true);
    expect(txOrder.updateMany).toHaveBeenCalledOnce(); // transition PENDING→PAID
    // AUCUN débit crédit ni ledger wallet au webhook.
    expect(txUser.updateMany).not.toHaveBeenCalled();
    expect(txUser.update).not.toHaveBeenCalled();
    expect(txWalletTransaction.create).not.toHaveBeenCalled();
  });

  it('Round 38 #4 — replay (order déjà PAID) → updateMany count=0, idempotent skip', async () => {
    // Status guard manqué = order déjà PAID (webhook replay)
    txOrder.updateMany.mockResolvedValue({ count: 0 });
    txOrder.findUnique.mockResolvedValue({ id: 'o_test', status: 'PAID' });

    const result = await markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_123' });

    expect(result).toBeDefined();
    // Mode B #3a — n'a PAS gagné la transition → le caller ne (re)soumettra pas.
    expect(result.transitioned).toBe(false);
    // Aucun side effect : ni event ni wallet
    expect(txOrderEvent.create).not.toHaveBeenCalled();
    expect(txUser.updateMany).not.toHaveBeenCalled();
    expect(txWalletTransaction.create).not.toHaveBeenCalled();
  });

  it('Mode B #3a — gagne la transition (count=1) → transitioned=true', async () => {
    txOrder.updateMany.mockResolvedValue({ count: 1 });
    txOrder.findUnique.mockResolvedValue({ id: 'o_test', status: 'PAID', referralCreditAppliedCents: 0, promoCodeId: null, userId: 'u1' });
    const result = await markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_123' });
    expect(result.transitioned).toBe(true);
    expect(result.order).toBeDefined();
  });

  it('paymentIntentId introuvable → OrderNotFoundError', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

    await expect(
      markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_unknown' }),
    ).rejects.toThrow(OrderNotFoundError);
  });

  // ─── Audit v2 #5.2 — increment promo gardé à la confirmation ──────────────
  it('order avec promoCodeId → increment usesCount gardé (SQL brut) dans la tx PAID', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o_test', userId: 'u_owner', paymentIntentId: 'pi_123', promoCodeId: 'promo_1',
    } as never);

    await markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_123' });

    expect(txExecuteRaw).toHaveBeenCalledOnce(); // increment gardé WHERE usesCount < maxUses
  });

  it('order sans promoCodeId → aucun increment promo', async () => {
    // findUnique par défaut (beforeEach) n'a pas de promoCodeId
    await markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_123' });
    expect(txExecuteRaw).not.toHaveBeenCalled();
  });

  it('promo épuisée entre checkout et paiement (affected=0) → pas de throw, rabais honoré', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o_test', userId: 'u_owner', paymentIntentId: 'pi_123', promoCodeId: 'promo_full',
    } as never);
    txExecuteRaw.mockResolvedValueOnce(0 as never); // garde maxUses → 0 ligne affectée

    const result = await markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_123' });
    expect(result).toBeDefined(); // le paiement (déjà capturé) n'est jamais rollback
  });
});
