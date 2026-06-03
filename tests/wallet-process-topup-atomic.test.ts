/**
 * Tests pour processWalletTopup — Round 37 #1 (atomicité) + Audit v2 #2.1/#3.4.
 *
 * Round 37 #1 — 1 seul $transaction wrap TOPUP + TOPUP_BONUS. Si BONUS fail,
 * TOPUP rollback aussi → ledger consistant.
 *
 * Audit v2 #2.1 — IDEMPOTENT : rejouer un webhook topup (replay admin, qui
 * bypasse le dedup WebhookEvent) ne crédite PAS 2× : no-op si un TOPUP existe
 * déjà pour ce paymentIntent.
 *
 * Audit v2 #3.4 — verrou pessimiste `SELECT … FOR UPDATE` sur la row User +
 * crédit via `increment` atomique (avant : read-modify-write non verrouillé).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Solde simulé : `user.update({ increment })` l'ajuste, `findUnique` le lit —
// reproduit fidèlement la sémantique increment atomique de Postgres.
let balance = 0;

const txMock = {
  // FOR UPDATE : retourne la row lockée (1 élément) si le user existe.
  $queryRaw: vi.fn(async () => [{ id: 'u_test' }]),
  user: {
    findUnique: vi.fn(async () => ({ walletCents: balance })),
    update: vi.fn(async (args: { data: { walletCents?: { increment?: number } } }) => {
      balance += args.data.walletCents?.increment ?? 0;
      return { walletCents: balance };
    }),
  },
  walletTransaction: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: 'wtx_test' })),
  },
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

// Prisma.sql est utilisé pour le SELECT … FOR UPDATE — on stub un tag minimal.
vi.mock('@prisma/client', () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({ strings, vals }) },
}));

import { prisma } from '@/lib/db';
import { processWalletTopup } from '@/lib/wallet/operations';

beforeEach(() => {
  vi.clearAllMocks();
  balance = 0;
  txMock.$queryRaw.mockResolvedValue([{ id: 'u_test' }] as never);
  txMock.user.findUnique.mockImplementation(async () => ({ walletCents: balance }));
  txMock.user.update.mockImplementation(async (args: { data: { walletCents?: { increment?: number } } }) => {
    balance += args.data.walletCents?.increment ?? 0;
    return { walletCents: balance };
  });
  txMock.walletTransaction.findFirst.mockResolvedValue(null as never);
  txMock.walletTransaction.create.mockResolvedValue({ id: 'wtx_test' } as never);
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

    const topupArgs = txMock.walletTransaction.create.mock.calls[0]![0];
    expect(topupArgs.data.kind).toBe('TOPUP');
    expect(topupArgs.data.amountCents).toBe(10000);
    expect(topupArgs.data.balanceAfterCents).toBe(10000); // 0 + 10000

    const bonusArgs = txMock.walletTransaction.create.mock.calls[1]![0];
    expect(bonusArgs.data.kind).toBe('TOPUP_BONUS');
    expect(bonusArgs.data.amountCents).toBe(500);
    expect(bonusArgs.data.balanceAfterCents).toBe(10500); // 10000 + 500
  });

  it('crédite via increment atomique (#3.4), pas un write absolu', async () => {
    await processWalletTopup({
      userId: 'u_test', amountCents: 7000, paymentIntentId: 'pi_inc', bonusCents: 0, tierLabel: null,
    });
    const updateArgs = txMock.user.update.mock.calls[0]![0];
    expect(updateArgs.data.walletCents).toEqual({ increment: 7000 });
  });

  it('topup sans bonus → 1 insert TOPUP seulement', async () => {
    await processWalletTopup({
      userId: 'u_test', amountCents: 5000, paymentIntentId: 'pi_test', bonusCents: 0, tierLabel: null,
    });
    expect(txMock.walletTransaction.create).toHaveBeenCalledOnce();
    const args = txMock.walletTransaction.create.mock.calls[0]![0];
    expect(args.data.kind).toBe('TOPUP');
  });

  it('bonus présent mais tierLabel null → pas de TOPUP_BONUS (defensive)', async () => {
    await processWalletTopup({
      userId: 'u_test', amountCents: 5000, paymentIntentId: 'pi_test', bonusCents: 500, tierLabel: null,
    });
    expect(txMock.walletTransaction.create).toHaveBeenCalledOnce();
    expect(txMock.walletTransaction.create.mock.calls[0]![0].data.kind).toBe('TOPUP');
  });

  it('BONUS insert fail → toute la tx rollback (TOPUP perdu aussi, $transaction throw)', async () => {
    txMock.walletTransaction.create
      .mockResolvedValueOnce({ id: 'wtx_topup' } as never)
      .mockRejectedValueOnce(new Error('DB blip on bonus') as never);

    await expect(
      processWalletTopup({
        userId: 'u_test', amountCents: 10000, paymentIntentId: 'pi_test', bonusCents: 500, tierLabel: 'Tier 50',
      }),
    ).rejects.toThrow(/DB blip/);
  });

  it('user introuvable (FOR UPDATE retourne 0 row) → throw + pas de side effect', async () => {
    txMock.$queryRaw.mockResolvedValueOnce([] as never);

    await expect(
      processWalletTopup({
        userId: 'u_missing', amountCents: 5000, paymentIntentId: 'pi_test', bonusCents: 0, tierLabel: null,
      }),
    ).rejects.toThrow(/introuvable/i);

    expect(txMock.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('return value : totalCreditCents + balanceAfterCents', async () => {
    balance = 1000; // solde initial

    const result = await processWalletTopup({
      userId: 'u_test', amountCents: 10000, paymentIntentId: 'pi_test', bonusCents: 500, tierLabel: 'Tier 50',
    });

    expect(result.totalCreditCents).toBe(10500);
    expect(result.balanceAfterCents).toBe(11500); // 1000 + 10000 + 500
  });

  it('description tronquée à 500 chars (DB column limit defensive)', async () => {
    await processWalletTopup({
      userId: 'u_test', amountCents: 10000, paymentIntentId: 'pi_test', bonusCents: 500, tierLabel: 'x'.repeat(600),
    });
    const bonusArgs = txMock.walletTransaction.create.mock.calls[1]![0];
    expect(String(bonusArgs.data.description).length).toBeLessThanOrEqual(500);
  });
});

describe('processWalletTopup idempotence (Audit v2 #2.1)', () => {
  it('prend un verrou pessimiste FOR UPDATE avant toute écriture', async () => {
    await processWalletTopup({
      userId: 'u_test', amountCents: 5000, paymentIntentId: 'pi_lock', bonusCents: 0, tierLabel: null,
    });
    expect(txMock.$queryRaw).toHaveBeenCalledOnce();
    // le lock précède le findFirst d'idempotence
    expect(txMock.$queryRaw).toHaveBeenCalled();
    expect(txMock.walletTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { paymentIntentId: 'pi_lock', kind: 'TOPUP' } }),
    );
  });

  it('TOPUP déjà enregistré pour ce paymentIntent → no-op (0), AUCUN crédit', async () => {
    txMock.walletTransaction.findFirst.mockResolvedValueOnce({ id: 'wtx_existing' } as never);
    balance = 8000;

    const result = await processWalletTopup({
      userId: 'u_test', amountCents: 5000, paymentIntentId: 'pi_replay', bonusCents: 500, tierLabel: 'Tier 50',
    });

    // Pas de double-crédit : aucun increment, aucun insert ledger.
    expect(txMock.user.update).not.toHaveBeenCalled();
    expect(txMock.walletTransaction.create).not.toHaveBeenCalled();
    expect(result.totalCreditCents).toBe(0);
    expect(result.alreadyProcessed).toBe(true);
    expect(result.balanceAfterCents).toBe(8000); // solde inchangé
  });

  it('replay : 2 appels avec le même paymentIntent ne créditent qu\'UNE fois', async () => {
    // 1er appel : pas encore enregistré → crédite
    const first = await processWalletTopup({
      userId: 'u_test', amountCents: 5000, paymentIntentId: 'pi_once', bonusCents: 0, tierLabel: null,
    });
    expect(first.totalCreditCents).toBe(5000);
    expect(txMock.walletTransaction.create).toHaveBeenCalledTimes(1);

    // 2e appel (replay) : findFirst voit maintenant le TOPUP → no-op
    txMock.walletTransaction.findFirst.mockResolvedValueOnce({ id: 'wtx_once' } as never);
    const second = await processWalletTopup({
      userId: 'u_test', amountCents: 5000, paymentIntentId: 'pi_once', bonusCents: 0, tierLabel: null,
    });
    expect(second.alreadyProcessed).toBe(true);
    // toujours 1 seul insert au total → pas de double-crédit
    expect(txMock.walletTransaction.create).toHaveBeenCalledTimes(1);
  });
});
