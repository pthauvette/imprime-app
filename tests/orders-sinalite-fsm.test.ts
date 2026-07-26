/**
 * applySinaliteStatusChange — FSM guard (Audit v2 #3.2).
 *
 * Avant : `order.update` brut SANS garde d'état → un webhook Sinalite tardif /
 * désordonné régressait le statut (DELIVERED→IN_PRODUCTION) et chaque re-push
 * (ETA corrigée) re-déclenchait l'envoi d'email.
 *
 * Maintenant : `updateMany` WHERE status IN (prior autorisés) ET status !=
 * nextStatus → transition seulement si valide ET réelle. Retourne
 * `transitioned` pour que le caller n'émette emails/refund qu'une fois.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const txMock = {
  order: {
    updateMany: vi.fn(
      async (_args: { where: { id: string; status: { in: string[]; not: string } }; data: unknown }) => ({ count: 1 }),
    ),
  },
  orderEvent: {
    create: vi.fn(async (_args: { data: { data: string } }) => ({ id: 'oe_1' })),
  },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock)),
  },
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { logWebhook: { info: noop, warn: noop, error: noop } };
});

import { prisma } from '@/lib/db';
import { applySinaliteStatusChange, OrderNotFoundError } from '@/lib/db/orders';

beforeEach(() => {
  vi.clearAllMocks();
  txMock.order.updateMany.mockResolvedValue({ count: 1 } as never);
  txMock.orderEvent.create.mockResolvedValue({ id: 'oe_1' } as never);
});

describe('applySinaliteStatusChange — FSM (#3.2)', () => {
  it('transition valide (SUBMITTED → SHIPPED) → transitioned=true, guard FSM appliqué', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { id: 'o1', status: 'SUBMITTED' } as never,
    );

    const r = await applySinaliteStatusChange({ sinaliteOrderId: 1, status: 'SHIPPED', data: {} });

    expect(r.transitioned).toBe(true);
    const where = txMock.order.updateMany.mock.calls[0]![0].where;
    // garde : prior autorisés + exclusion du self-loop
    expect(where.id).toBe('o1');
    expect(where.status.not).toBe('SHIPPED');
    expect(where.status.in).toContain('SUBMITTED');
    // OrderEvent d'audit toujours créé
    expect(txMock.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'SINALITE_STATUS_CHANGED' }) }),
    );
  });

  it('écrit le payload Sinalite À PLAT (pas imbriqué sous `payload`) — sinon le tracking disparaît du portail', async () => {
    // Bug 2026-07 : `data: {payload: input.data, ...}` empêchait timeline.ts de
    // lire `status`/`trackingNumber` (attendus à la racine, comme le chemin
    // admin manuel les écrit). Cf. docs/experience-client-2026-07.md Foyer 5.
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { id: 'o4', status: 'SUBMITTED' } as never,
    );

    await applySinaliteStatusChange({
      sinaliteOrderId: 4,
      status: 'SHIPPED',
      data: { orderId: 4, status: 'SHIPPED', trackingNumber: '1Z999', carrier: 'UPS' },
    });

    const written = JSON.parse(
      txMock.orderEvent.create.mock.calls[0]![0].data.data as string,
    ) as Record<string, unknown>;
    expect(written.status).toBe('SHIPPED');
    expect(written.trackingNumber).toBe('1Z999');
    expect(written.carrier).toBe('UPS');
    expect(written.payload).toBeUndefined();
    // Les métadonnées d'audit restent présentes, juste à côté (pas imbriquées).
    expect(written.transitioned).toBe(true);
    expect(written.fromStatus).toBe('SUBMITTED');
    expect(written.toStatus).toBe('SHIPPED');
  });

  it('régression (DELIVERED puis IN_PRODUCTION tardif) → count=0 → transitioned=false', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { id: 'o2', status: 'DELIVERED' } as never,
    );
    txMock.order.updateMany.mockResolvedValueOnce({ count: 0 } as never);

    const r = await applySinaliteStatusChange({ sinaliteOrderId: 2, status: 'IN_PRODUCTION', data: {} });

    expect(r.transitioned).toBe(false);
    expect(r.fromStatus).toBe('DELIVERED');
    // l'OrderEvent d'audit est quand même enregistré (debug out-of-order)
    expect(txMock.orderEvent.create).toHaveBeenCalledOnce();
  });

  it('self-loop (SHIPPED rejoué) → exclu par `not` → count=0 → transitioned=false', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(
      { id: 'o3', status: 'SHIPPED' } as never,
    );
    txMock.order.updateMany.mockResolvedValueOnce({ count: 0 } as never);

    const r = await applySinaliteStatusChange({ sinaliteOrderId: 3, status: 'SHIPPED', data: {} });

    expect(r.transitioned).toBe(false);
    expect(txMock.order.updateMany.mock.calls[0]![0].where.status.not).toBe('SHIPPED');
  });

  it('order Sinalite inconnu → OrderNotFoundError', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(null as never);

    await expect(
      applySinaliteStatusChange({ sinaliteOrderId: 999, status: 'SHIPPED', data: {} }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
