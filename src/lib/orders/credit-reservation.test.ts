import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  txOrderCreate: vi.fn(),
  userUpdateMany: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  walletTxCreate: vi.fn(),
  orderEventCreate: vi.fn(),
  txOrderUpdateMany: vi.fn(),
  txOrderFindUnique: vi.fn(),
  orderFindUnique: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    // $transaction exécute le callback avec un tx mocké ; si le callback throw,
    // $transaction rejette (= rollback) — le caller gère.
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      order: { create: h.txOrderCreate, updateMany: h.txOrderUpdateMany, findUnique: h.txOrderFindUnique },
      user: { updateMany: h.userUpdateMany, findUnique: h.userFindUnique, update: h.userUpdate },
      walletTransaction: { create: h.walletTxCreate },
      orderEvent: { create: h.orderEventCreate },
    }),
    order: { findUnique: h.orderFindUnique },
  },
}));

import { createReservedOrder, releaseReservedCreditsOnCancel, InsufficientCreditError } from './credit-reservation';
import type { CreateOrderInput } from '@/lib/db/orders';

const P2002 = () => new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });

const INPUT = {
  userId: 'u1', paymentIntentId: 'pi_1', amountCents: 5000, itemsCount: 1,
  subtotalCents: 6000, shippingCents: 1000, taxCents: 500,
  walletCreditAppliedCents: 2000, referralCreditAppliedCents: 500,
  shippingMethod: 'UPS', province: 'QC', shipName: 'T', shipLine1: '1', shipCity: 'M', shipProvince: 'QC', shipPostalCode: 'H2X', shipPhone: '5145551234',
  sinalitePayload: { items: [] },
} as unknown as CreateOrderInput;

beforeEach(() => {
  vi.clearAllMocks();
  h.txOrderCreate.mockResolvedValue({ id: 'ord_1' });
  h.userUpdateMany.mockResolvedValue({ count: 1 });
  h.userFindUnique.mockResolvedValue({ walletCents: 100 });
  h.userUpdate.mockResolvedValue({});
  h.walletTxCreate.mockResolvedValue({});
  h.orderEventCreate.mockResolvedValue({});
});

describe('createReservedOrder', () => {
  it('happy path : Order créé + wallet ET referral décrémentés (gte), replay=false', async () => {
    const r = await createReservedOrder(INPUT);
    expect(r.replay).toBe(false);
    expect(r.order.id).toBe('ord_1');
    // order.create AVANT toute réservation
    expect(h.txOrderCreate).toHaveBeenCalledTimes(1);
    // wallet : updateMany avec gate gte + decrement
    expect(h.userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1', walletCents: { gte: 2000 } },
      data: expect.objectContaining({ walletCents: { decrement: 2000 } }),
    }));
    // referral : updateMany avec gate gte + decrement
    expect(h.userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1', referralCreditCents: { gte: 500 } },
      data: { referralCreditCents: { decrement: 500 } },
    }));
    expect(h.walletTxCreate).toHaveBeenCalled(); // ledger ORDER_SPEND
  });

  it('solde wallet insuffisant (count===0) → InsufficientCreditError(wallet), rollback', async () => {
    h.userUpdateMany.mockResolvedValueOnce({ count: 0 }); // wallet insuffisant
    await expect(createReservedOrder(INPUT)).rejects.toMatchObject({ creditKind: 'wallet' });
    expect(h.walletTxCreate).not.toHaveBeenCalled(); // rollback : pas de ledger
  });

  it('solde referral insuffisant (2e updateMany count===0) → InsufficientCreditError(referral)', async () => {
    h.userUpdateMany.mockResolvedValueOnce({ count: 1 }); // wallet ok
    h.userUpdateMany.mockResolvedValueOnce({ count: 0 }); // referral insuffisant
    await expect(createReservedOrder(INPUT)).rejects.toMatchObject({ creditKind: 'referral' });
  });

  it('aucun crédit appliqué → Order créé, AUCUN décrément', async () => {
    const r = await createReservedOrder({ ...INPUT, walletCreditAppliedCents: 0, referralCreditAppliedCents: 0 });
    expect(r.order.id).toBe('ord_1');
    expect(h.userUpdateMany).not.toHaveBeenCalled();
  });

  it('double-submit : order.create → P2002 → retourne l\'Order existant, replay=true, AUCUNE réservation', async () => {
    h.txOrderCreate.mockRejectedValueOnce(P2002());
    h.orderFindUnique.mockResolvedValueOnce({ id: 'ord_existing' });
    const r = await createReservedOrder(INPUT);
    expect(r.replay).toBe(true);
    expect(r.order.id).toBe('ord_existing');
    expect(h.userUpdateMany).not.toHaveBeenCalled(); // pas de re-réservation
  });
});

describe('releaseReservedCreditsOnCancel', () => {
  beforeEach(() => {
    h.txOrderUpdateMany.mockResolvedValue({ count: 1 }); // gagne PENDING→CANCELLED
    h.txOrderFindUnique.mockResolvedValue({ userId: 'u1', walletCreditAppliedCents: 2000, referralCreditAppliedCents: 500 });
  });

  it('gagne la transition PENDING→CANCELLED → restaure wallet + referral, released=true', async () => {
    const r = await releaseReservedCreditsOnCancel({ orderId: 'ord_1' });
    expect(r.released).toBe(true);
    expect(r.walletCents).toBe(2000);
    expect(r.referralCents).toBe(500);
    expect(h.userUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ walletCents: { increment: 2000 } }) }));
    expect(h.userUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { referralCreditCents: { increment: 500 } } }));
  });

  it('déjà transitionné (count===0) → released=false, AUCUNE restauration (anti double-dip inverse)', async () => {
    h.txOrderUpdateMany.mockResolvedValueOnce({ count: 0 });
    const r = await releaseReservedCreditsOnCancel({ orderId: 'ord_1' });
    expect(r.released).toBe(false);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('Order sans crédit appliqué → transition gagnée mais aucun increment', async () => {
    h.txOrderFindUnique.mockResolvedValueOnce({ userId: 'u1', walletCreditAppliedCents: 0, referralCreditAppliedCents: 0 });
    const r = await releaseReservedCreditsOnCancel({ orderId: 'ord_1' });
    expect(r.released).toBe(true);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });
});
