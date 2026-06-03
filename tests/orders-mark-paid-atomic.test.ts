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

  // Audit v2 #3.3 — AVANT : overdraft → throw → order coincée PENDING alors que
  // Stripe a déjà chargé. MAINTENANT : clamp au disponible, order complétée.
  it('solde insuffisant (100 < 500) → CLAMP au disponible, PAS de throw', async () => {
    txOrder.updateMany.mockResolvedValue({ count: 1 }); // order guard passe
    txUser.updateMany.mockResolvedValue({ count: 0 });   // wallet gte guard échoue
    txUser.findUnique.mockResolvedValue({ walletCents: 100 }); // dispo réel = 100
    txUser.update.mockResolvedValue({});

    // ne throw PAS
    const result = await markOrderPaidWithWalletDebit({
      paymentIntentId: 'pi_123',
      walletDebit: { userId: 'u_owner', amountCents: 500, description: 'clamp test' },
    });
    expect(result).toBeDefined();

    // débite le disponible (100) via update
    expect(txUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ walletCents: { decrement: 100 } }) }),
    );
    // ledger ORDER_SPEND clampé : -100, balanceAfter 0
    const walletTxArgs = txWalletTransaction.create.mock.calls[0]![0];
    expect(walletTxArgs.data.amountCents).toBe(-100);
    expect(walletTxArgs.data.balanceAfterCents).toBe(0);

    // alerte APRÈS commit du manque (500 - 100 = 400¢)
    expect(sendCriticalAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warning', context: expect.objectContaining({ shortfallCents: 400 }) }),
    );
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

  // ─── Audit v2 #3.1 — débit du crédit referral à la confirmation ───────────
  it('referral appliqué → débité (gte guard) dans la même tx que PAID', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o_test', userId: 'u_owner', paymentIntentId: 'pi_123',
      referralCreditAppliedCents: 2500,
    } as never);

    await markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_123' });

    // un seul updateMany user (referral) — pas de walletDebit ici
    expect(txUser.updateMany).toHaveBeenCalledOnce();
    const refArgs = txUser.updateMany.mock.calls[0]![0];
    expect(refArgs.where.referralCreditCents).toEqual({ gte: 2500 }); // plancher
    expect(refArgs.data.referralCreditCents).toEqual({ decrement: 2500 });
    // pas de clamp (guard a réussi)
    expect(txUser.update).not.toHaveBeenCalled();
  });

  it('referral insuffisant (concurrent spend) → clampé au restant, PAS de throw', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o_test', userId: 'u_owner', paymentIntentId: 'pi_123',
      referralCreditAppliedCents: 2500,
    } as never);
    txUser.updateMany.mockResolvedValue({ count: 0 }); // gte guard échoue
    txUser.findUnique.mockResolvedValue({ referralCreditCents: 1000 }); // reste 10$

    // ne throw PAS (sinon order coincée PENDING alors que Stripe a chargé)
    const result = await markOrderPaidWithWalletDebit({ paymentIntentId: 'pi_123' });
    expect(result).toBeDefined();

    // clamp : on débite le restant (1000), jamais en-dessous de 0
    expect(txUser.update).toHaveBeenCalledOnce();
    const clampArgs = txUser.update.mock.calls[0]![0];
    expect(clampArgs.data.referralCreditCents).toEqual({ decrement: 1000 });
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
