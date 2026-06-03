/**
 * grantWelcomeCredit — Audit v2 #8.3.
 *
 * La page d'inscription promet « 25 $ offerts ». Ce helper matérialise le crédit
 * au premier sign-in. Verrouille : (1) crédite 2500¢ via recordWalletTx kind
 * WELCOME_CREDIT, (2) IDEMPOTENT — ne crédite jamais 2× (un WELCOME_CREDIT
 * existant → 0, aucun recordWalletTx).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const txMock = {
  user: {
    updateMany: vi.fn(async () => ({ count: 1 })),
    findUnique: vi.fn(async () => ({ walletCents: 2500 })),
  },
  walletTransaction: { create: vi.fn(async () => ({ id: 'wtx_welcome' })) },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    walletTransaction: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock)),
  },
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { logEmail: { info: noop, warn: noop, error: noop }, logStripe: { info: noop, warn: noop, error: noop } };
});

import { prisma } from '@/lib/db';
import { grantWelcomeCredit, WELCOME_CREDIT_CENTS } from '@/lib/wallet/operations';

beforeEach(() => {
  vi.clearAllMocks();
  txMock.user.updateMany.mockResolvedValue({ count: 1 } as never);
  txMock.user.findUnique.mockResolvedValue({ walletCents: 2500 } as never);
  txMock.walletTransaction.create.mockResolvedValue({ id: 'wtx_welcome' } as never);
});

describe('grantWelcomeCredit (#8.3)', () => {
  it('montant = 25 $', () => {
    expect(WELCOME_CREDIT_CENTS).toBe(2500);
  });

  it('premier sign-in → crédite 2500¢ (kind WELCOME_CREDIT, montant positif)', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValueOnce(null as never);

    const granted = await grantWelcomeCredit('u_new');

    expect(granted).toBe(2500);
    expect(txMock.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'WELCOME_CREDIT', amountCents: 2500, userId: 'u_new' }),
      }),
    );
  });

  it('IDEMPOTENT : un WELCOME_CREDIT existe déjà → 0, aucun crédit', async () => {
    vi.mocked(prisma.walletTransaction.findFirst).mockResolvedValueOnce({ id: 'existing' } as never);

    const granted = await grantWelcomeCredit('u_existing');

    expect(granted).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled(); // recordWalletTx jamais appelé
    // la garde est scopée user + kind WELCOME_CREDIT
    expect(prisma.walletTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u_existing', kind: 'WELCOME_CREDIT' } }),
    );
  });
});
