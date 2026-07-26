/**
 * Tests GET /api/cron/sinalite-reconcile — finding [39].
 *
 * Lock-in :
 *   - inerte par défaut (SINALITE_RECONCILE_ENABLED != '1') — AUCUN appel Sinalite
 *   - 401 si Bearer manquant en prod
 *   - interroge Sinalite pour chaque commande stale, rejoue processSinaliteEvent
 *     UNIQUEMENT si le statut diverge réellement
 *   - items à statuts ambigus (partiel) → skip, jamais de reconciliation devinée
 *   - 404 Sinalite (commande introuvable côté fournisseur) → compté, pas un crash
 *   - une commande qui échoue n'empêche pas les autres (fail-soft per-order)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/sinalite/client', () => {
  class SinaliteError extends Error {
    status: number;
    endpoint: string;
    constructor(message: string, status: number, endpoint: string) {
      super(message);
      this.status = status;
      this.endpoint = endpoint;
    }
  }
  return {
    sinalite: { getOrder: vi.fn() },
    SinaliteError,
  };
});

vi.mock('@/lib/webhooks/sinalite-process', () => ({
  processSinaliteEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true, id: 'em_1' })),
}));
vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { prisma } from '@/lib/db';
import { sinalite, SinaliteError } from '@/lib/sinalite/client';
import { processSinaliteEvent } from '@/lib/webhooks/sinalite-process';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

function makeReq(authHeader = 'Bearer test_secret'): Request {
  return new Request('http://localhost/api/cron/sinalite-reconcile', {
    headers: { authorization: authHeader },
  });
}

function orderDetail(status: 'NEW' | 'IN_PRODUCTION' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED') {
  return { order: {}, items: [{ status }] } as never;
}

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  vi.resetAllMocks();
  process.env = {
    ...ORIG_ENV,
    CRON_SECRET: 'test_secret',
    NODE_ENV: 'production',
    SINALITE_RECONCILE_ENABLED: '1',
    ADMIN_EMAILS: 'a1@plio.ca',
  };
  vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
});

describe('GET /api/cron/sinalite-reconcile', () => {
  it('inerte par défaut (flag off) — AUCUN appel Sinalite, AUCUNE query DB', async () => {
    process.env.SINALITE_RECONCILE_ENABLED = undefined;
    const { GET } = await import('@/app/api/cron/sinalite-reconcile/route');
    const res = await GET(makeReq() as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.skipped).toBe('flag_off');
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(sinalite.getOrder).not.toHaveBeenCalled();
  });

  it('401 si Bearer manquant en prod', async () => {
    const { GET } = await import('@/app/api/cron/sinalite-reconcile/route');
    const res = await GET(makeReq('') as never);
    expect(res.status).toBe(401);
  });

  it('statut réel divergent (SHIPPED alors que DB dit PAID) → rejoue processSinaliteEvent, compté "reconciled"', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { id: 'ord_1', status: 'PAID', sinaliteOrderId: '999' },
    ] as never);
    vi.mocked(sinalite.getOrder).mockResolvedValueOnce(orderDetail('SHIPPED'));
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({ status: 'SHIPPED' } as never);

    const { GET } = await import('@/app/api/cron/sinalite-reconcile/route');
    const res = await GET(makeReq() as never);
    const json = await res.json();

    expect(processSinaliteEvent).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 999, status: 'SHIPPED' }),
      expect.any(Object),
    );
    expect(json.summary.reconciled).toBe(1);
    expect(sendAdminCustomMessageEmail).toHaveBeenCalledTimes(1);
  });

  it('statut réel = statut DB (webhook pas manqué, juste lent) → "unchanged", pas d\'email admin', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { id: 'ord_2', status: 'IN_PRODUCTION', sinaliteOrderId: '998' },
    ] as never);
    vi.mocked(sinalite.getOrder).mockResolvedValueOnce(orderDetail('IN_PRODUCTION'));
    // processSinaliteEvent no-op (transitioned-guard) → statut DB inchangé après coup.
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({ status: 'IN_PRODUCTION' } as never);

    const { GET } = await import('@/app/api/cron/sinalite-reconcile/route');
    const res = await GET(makeReq() as never);
    const json = await res.json();

    expect(json.summary.unchanged).toBe(1);
    expect(json.summary.reconciled).toBe(0);
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
  });

  it('items à statuts AMBIGUS (partiel) → skip, ne devine JAMAIS', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { id: 'ord_3', status: 'IN_PRODUCTION', sinaliteOrderId: '997' },
    ] as never);
    vi.mocked(sinalite.getOrder).mockResolvedValueOnce({
      order: {},
      items: [{ status: 'SHIPPED' }, { status: 'IN_PRODUCTION' }],
    } as never);

    const { GET } = await import('@/app/api/cron/sinalite-reconcile/route');
    const res = await GET(makeReq() as never);
    const json = await res.json();

    expect(processSinaliteEvent).not.toHaveBeenCalled();
    expect(json.summary.ambiguous).toBe(1);
  });

  it('404 Sinalite (commande introuvable côté fournisseur) → compté notFound, pas un crash', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { id: 'ord_4', status: 'PAID', sinaliteOrderId: '996' },
    ] as never);
    vi.mocked(sinalite.getOrder).mockRejectedValueOnce(new SinaliteError('not found', 404, '/order/996'));

    const { GET } = await import('@/app/api/cron/sinalite-reconcile/route');
    const res = await GET(makeReq() as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.summary.notFound).toBe(1);
    expect(processSinaliteEvent).not.toHaveBeenCalled();
  });

  it('une commande en échec n\'empêche pas les autres (fail-soft per-order)', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { id: 'ord_5', status: 'PAID', sinaliteOrderId: '995' },
      { id: 'ord_6', status: 'PAID', sinaliteOrderId: '994' },
    ] as never);
    vi.mocked(sinalite.getOrder)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(orderDetail('SHIPPED'));
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({ status: 'SHIPPED' } as never);

    const { GET } = await import('@/app/api/cron/sinalite-reconcile/route');
    const res = await GET(makeReq() as never);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.summary.failed).toBe(1);
    expect(json.summary.reconciled).toBe(1);
  });
});
