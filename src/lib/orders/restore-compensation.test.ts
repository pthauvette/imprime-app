import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WALLET_RESTORE_PENDING, REFERRAL_RESTORE_PENDING } from '@/lib/orders/restore-markers';

// ── Mocks des frontières ────────────────────────────────────────────────────
const m = vi.hoisted(() => ({
  oeFindMany: vi.fn(),
  oeFindFirst: vi.fn(),
  oeCreate: vi.fn(),
  orderFindUnique: vi.fn(),
  wtFindFirst: vi.fn(),
  restoreWallet: vi.fn(),
  restoreReferral: vi.fn(),
  alert: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: {
  orderEvent: { findMany: m.oeFindMany, findFirst: m.oeFindFirst, create: m.oeCreate },
  order: { findUnique: m.orderFindUnique },
  walletTransaction: { findFirst: m.wtFindFirst },
} }));
vi.mock('@/lib/wallet/operations', () => ({ restoreWalletCreditOnFullRefund: m.restoreWallet }));
vi.mock('@/lib/referrals/restore', () => ({ restoreReferralCreditOnFullRefund: m.restoreReferral }));
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert: m.alert }));

import { runRestoreCompensation } from './restore-compensation';

const H = 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  m.oeFindMany.mockResolvedValue([]);
  m.oeFindFirst.mockResolvedValue(null);
  m.oeCreate.mockResolvedValue({});
  m.orderFindUnique.mockResolvedValue(null);
  m.wtFindFirst.mockResolvedValue(null);
  m.restoreWallet.mockResolvedValue(0);
  m.restoreReferral.mockResolvedValue(0);
});

/** Renvoie les items PENDING selon le kind demandé (findMany order-independent). */
function pendingByKind(wallet: unknown[], referral: unknown[] = []) {
  m.oeFindMany.mockImplementation(async (args: { where: { kind: string } }) =>
    args.where.kind === WALLET_RESTORE_PENDING ? wallet
    : args.where.kind === REFERRAL_RESTORE_PENDING ? referral
    : [],
  );
}

describe('runRestoreCompensation — wallet', () => {
  it('marqueur en attente, pas encore restauré → rejoue le restore idempotent (suppressAlert) → resolved', async () => {
    pendingByKind([{ orderId: 'o1', createdAt: new Date(1000), data: JSON.stringify({ refundId: 're_1' }) }]);
    m.wtFindFirst.mockResolvedValue(null); // pas de REFUND tx → à restaurer
    m.orderFindUnique.mockResolvedValue({ id: 'o1', userId: 'u1', walletCreditAppliedCents: 2000 });
    m.restoreWallet.mockResolvedValue(2000); // le retry réussit

    const res = await runRestoreCompensation({ nowMs: 5000 });

    expect(m.restoreWallet).toHaveBeenCalledWith(
      expect.objectContaining({ order: expect.objectContaining({ id: 'o1' }), refundId: 're_1', suppressAlert: true }),
    );
    expect(res.wallet).toMatchObject({ pending: 1, resolved: 1, stillFailing: 0, escalated: 0 });
    expect(m.alert).not.toHaveBeenCalled();
  });

  it('déjà restauré (REFUND tx existe) → sauté, aucun retry ni chargement d\'Order', async () => {
    pendingByKind([{ orderId: 'o1', createdAt: new Date(1000), data: null }]);
    m.wtFindFirst.mockResolvedValue({ id: 'wt1' }); // REFUND tx présent → condition de succès remplie

    const res = await runRestoreCompensation({ nowMs: 5000 });

    expect(m.restoreWallet).not.toHaveBeenCalled();
    expect(m.orderFindUnique).not.toHaveBeenCalled();
    expect(res.wallet).toMatchObject({ pending: 1, resolved: 0, stillFailing: 0 });
  });

  it('retry échoue + marqueur > 6 h → escalade critique UNE fois', async () => {
    pendingByKind([{ orderId: 'o1', createdAt: new Date(0), data: null }]); // très vieux
    m.wtFindFirst.mockResolvedValue(null);
    m.orderFindUnique.mockResolvedValue({ id: 'o1', userId: 'u1', walletCreditAppliedCents: 2000 });
    m.restoreWallet.mockResolvedValue(0); // échoue encore
    m.oeFindFirst.mockResolvedValue(null); // pas de marqueur ESCALATED → première escalade

    const res = await runRestoreCompensation({ nowMs: 10 * H }); // marqueur âgé de 10 h

    expect(m.alert).toHaveBeenCalledTimes(1);
    expect(m.oeCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ orderId: 'o1' }) }));
    expect(res.wallet).toMatchObject({ resolved: 0, stillFailing: 1, escalated: 1 });
  });

  it('échec persistant mais déjà escaladé (marqueur ESCALATED présent) → pas de re-alerte (anti-spam)', async () => {
    pendingByKind([{ orderId: 'o1', createdAt: new Date(0), data: null }]);
    m.wtFindFirst.mockResolvedValue(null);
    m.orderFindUnique.mockResolvedValue({ id: 'o1', userId: 'u1', walletCreditAppliedCents: 2000 });
    m.restoreWallet.mockResolvedValue(0);
    m.oeFindFirst.mockResolvedValue({ id: 'esc1' }); // ESCALATED déjà là

    const res = await runRestoreCompensation({ nowMs: 10 * H });

    expect(m.alert).not.toHaveBeenCalled();
    expect(res.wallet).toMatchObject({ stillFailing: 1, escalated: 0 });
  });

  it('échec récent (< 6 h) → stillFailing mais PAS d\'escalade', async () => {
    pendingByKind([{ orderId: 'o1', createdAt: new Date(1000), data: null }]);
    m.wtFindFirst.mockResolvedValue(null);
    m.orderFindUnique.mockResolvedValue({ id: 'o1', userId: 'u1', walletCreditAppliedCents: 2000 });
    m.restoreWallet.mockResolvedValue(0);

    const res = await runRestoreCompensation({ nowMs: 1000 + 2 * H }); // 2 h < 6 h

    expect(m.alert).not.toHaveBeenCalled();
    expect(res.wallet).toMatchObject({ stillFailing: 1, escalated: 0 });
  });
});

describe('runRestoreCompensation — referral', () => {
  it('marqueur en attente, pas restauré → rejoue le restore referral (suppressAlert) → resolved', async () => {
    pendingByKind([], [{ orderId: 'o2', createdAt: new Date(1000), data: JSON.stringify({ refundId: 're_2' }) }]);
    m.oeFindFirst.mockResolvedValue(null); // REFERRAL_CREDIT_RESTORED absent → à restaurer
    m.orderFindUnique.mockResolvedValue({ id: 'o2', userId: 'u2', referralCreditAppliedCents: 1000 });
    m.restoreReferral.mockResolvedValue(1000);

    const res = await runRestoreCompensation({ nowMs: 5000 });

    expect(m.restoreReferral).toHaveBeenCalledWith(
      expect.objectContaining({ order: expect.objectContaining({ id: 'o2' }), refundId: 're_2', suppressAlert: true }),
    );
    expect(res.referral).toMatchObject({ pending: 1, resolved: 1, stillFailing: 0 });
  });

  it('referral déjà restauré (event REFERRAL_CREDIT_RESTORED présent) → sauté', async () => {
    pendingByKind([], [{ orderId: 'o2', createdAt: new Date(1000), data: null }]);
    m.oeFindFirst.mockResolvedValue({ id: 'ev1' }); // condition de succès remplie

    const res = await runRestoreCompensation({ nowMs: 5000 });

    expect(m.restoreReferral).not.toHaveBeenCalled();
    expect(res.referral).toMatchObject({ pending: 1, resolved: 0 });
  });
});
