/**
 * Tests POST /api/admin/orders/[id]/refund — Round 36 #4.
 *
 * Lock-in : audit Round 35+1 flag P0 — money path sans test direct.
 *
 * Couverture :
 *   - 401 si pas admin
 *   - 404 si order pas trouvé
 *   - 400 si status PENDING (refund avant capture)
 *   - 400 si refund amount > order total
 *   - 502 si Stripe refund throw
 *   - 200 + Stripe refund called avec metadata correct
 *   - 200 + markRefundIssued appelé
 *   - 200 + cancelOrder true → markOrderFailed appelé
 *   - 200 + email refund-issued envoyé
 *   - 200 + audit log ADMIN_MANUAL_REFUND
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: { order: { findUnique: vi.fn() } },
}));

// Audit v2 #1.2/#1.4 — la restauration wallet sur full refund est extraite dans
// restoreWalletCreditOnFullRefund (testé à part dans wallet-restore-on-refund).
// Ici on mocke le helper et on vérifie que /refund le pilote correctement.
vi.mock('@/lib/wallet/operations', () => ({
  recordWalletTx: vi.fn(async () => ({ balanceAfterCents: 0, txId: 'wtx_test' })),
  restoreWalletCreditOnFullRefund: vi.fn(async () => 2000),
}));

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => true),
}));

vi.mock('@/lib/db/orders', () => ({
  markRefundIssued: vi.fn(async () => undefined),
  markOrderFailed: vi.fn(async () => undefined),
}));

vi.mock('@/lib/emails/send', () => ({
  sendRefundIssuedEmail: vi.fn(async () => ({ sent: true, id: 'em_1' })),
}));

vi.mock('@/lib/db/admin-audit', () => ({
  recordAdminAudit: vi.fn(async () => undefined),
}));

vi.mock('@/lib/api-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return actual;
});

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  // Round 37 #1 — la route catch+log via logStripe.error si wallet restore fail
  return { log: stub, logStripe: stub, logEmail: stub, logSinalite: stub };
});

// Stripe mock via vi.hoisted. Annotate vi.fn arg/return types pour que
// mock.calls soit typé en aval (sinon TS infers calls: never[]).
const stripeMock = vi.hoisted(() => ({
  refunds: {
    create: vi.fn<(args: { payment_intent: string; amount?: number; reason?: string; metadata: Record<string, string> }) => Promise<{ id: string; status: string }>>(
      async () => ({ id: 're_test_123', status: 'succeeded' }),
    ),
    // Round 4 #4 — déjà-remboursé dérivé de Stripe. Default : aucun refund
    // antérieur (data vide) → restant = total.
    list: vi.fn<(args: { payment_intent: string; limit?: number }) => Promise<{ data: Array<{ amount: number; status: string }> }>>(
      async () => ({ data: [] }),
    ),
  },
}));
vi.mock('stripe', () => {
  function StripeMock(this: unknown) { return stripeMock; }
  return { default: StripeMock };
});

import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { markRefundIssued, markOrderFailed } from '@/lib/db/orders';
import { sendRefundIssuedEmail } from '@/lib/emails/send';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { restoreWalletCreditOnFullRefund } from '@/lib/wallet/operations';

const ORDER_BASE = {
  id: 'o_test',
  userId: 'u_owner',
  status: 'PAID',
  amountCents: 8000, // $80 facturé Stripe
  walletCreditAppliedCents: 2000, // $20 wallet déjà débité — Round 37 #1
  paymentIntentId: 'pi_123',
  currency: 'cad',
  user: { id: 'u_owner', email: 'customer@plio.ca', firstName: 'Customer' },
};

function makeReq(body: unknown) {
  return new Request('http://localhost/api/admin/orders/o_test/refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default : admin authentifié
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    userId: 'u_admin',
    user: { id: 'u_admin', email: 'admin@plio.ca' },
  } as never);
  vi.mocked(prisma.order.findUnique).mockResolvedValue(ORDER_BASE as never);
  stripeMock.refunds.create.mockResolvedValue({ id: 're_test_123', status: 'succeeded' } as never);
  stripeMock.refunds.list.mockResolvedValue({ data: [] } as never);
});

describe('POST /api/admin/orders/[id]/refund (Round 36 #4)', () => {
  it('Unauthorized si requireAdmin fail', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    } as never);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(401);
  });

  it('404 si order pas trouvé', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: 'o_missing' }) });
    expect(res.status).toBe(404);
  });

  it('400 si order PENDING (paiement pas encore capturé)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...ORDER_BASE, status: 'PENDING' } as never);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/PENDING/);
  });

  it('400 si refund amount > order total (aucun refund antérieur)', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(
      makeReq({ amountCents: 9000 }), // > order 8000, rien de déjà remboursé
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('REFUND_EXCEEDS_REMAINING');
    expect(json.remainingCents).toBe(8000);
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
  });

  // ─── Round 4 #4 — cumul des refunds partiels borné ───────────────────────

  it('400 si le CUMUL dépasse le restant (3000 demandé alors que 6000 déjà remboursé sur 8000)', async () => {
    stripeMock.refunds.list.mockResolvedValueOnce({
      data: [{ amount: 6000, status: 'succeeded' }],
    } as never);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(
      makeReq({ amountCents: 3000 }), // 6000 + 3000 = 9000 > 8000
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('REFUND_EXCEEDS_REMAINING');
    expect(json.remainingCents).toBe(2000); // 8000 - 6000
    expect(json.alreadyRefundedCents).toBe(6000);
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
  });

  it('200 si le refund tient dans le restant (2000 sur restant 2000)', async () => {
    stripeMock.refunds.list.mockResolvedValueOnce({
      data: [{ amount: 6000, status: 'succeeded' }],
    } as never);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(
      makeReq({ amountCents: 2000 }),
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(200);
    expect(stripeMock.refunds.create).toHaveBeenCalledOnce();
  });

  it('400 si déjà entièrement remboursé (full refund demandé)', async () => {
    stripeMock.refunds.list.mockResolvedValueOnce({
      data: [{ amount: 8000, status: 'succeeded' }],
    } as never);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('REFUND_NONE_REMAINING');
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
  });

  it('ignore les refunds failed/canceled dans le cumul', async () => {
    stripeMock.refunds.list.mockResolvedValueOnce({
      data: [
        { amount: 8000, status: 'failed' },
        { amount: 8000, status: 'canceled' },
      ],
    } as never);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(makeReq({ amountCents: 5000 }), { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(200); // restant = 8000 (les échoués ne comptent pas)
    expect(stripeMock.refunds.create).toHaveBeenCalledOnce();
  });

  it('502 si refunds.list throw (impossible de vérifier le cumul)', async () => {
    stripeMock.refunds.list.mockRejectedValueOnce(new Error('Stripe list down'));
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(makeReq({ amountCents: 1000 }), { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(502);
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
  });

  it('502 si Stripe refunds.create throw', async () => {
    stripeMock.refunds.create.mockRejectedValueOnce(new Error('Stripe API down'));
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(502);
  });

  it('200 + full refund → Stripe.refunds.create avec metadata correct', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(
      makeReq({ reason: 'Customer requested' }),
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(200);

    expect(stripeMock.refunds.create).toHaveBeenCalledOnce();
    const args = stripeMock.refunds.create.mock.calls[0]![0];
    expect(args.payment_intent).toBe('pi_123');
    expect(args.amount).toBeUndefined(); // full refund = no amount
    expect(args.metadata.orderId).toBe('o_test');
    expect(args.metadata.adminUserId).toBe('u_admin');
    expect(args.metadata.reason).toBe('Customer requested');
  });

  it('200 + partial refund → amount passé à Stripe', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(
      makeReq({ amountCents: 3000, reason: 'Damaged item' }),
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    const args = stripeMock.refunds.create.mock.calls[0]![0];
    expect(args.amount).toBe(3000);
  });

  // ─── Round 37 #1 — Wallet credit restore tests ───────────────────────────

  it('full refund → restoreWalletCreditOnFullRefund piloté avec order + actorId, walletRestoredCents = son retour', async () => {
    vi.mocked(restoreWalletCreditOnFullRefund).mockResolvedValueOnce(2000);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(
      makeReq({}), // pas d'amountCents = full refund
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.walletRestoredCents).toBe(2000); // = retour du helper

    expect(restoreWalletCreditOnFullRefund).toHaveBeenCalledOnce();
    const args = vi.mocked(restoreWalletCreditOnFullRefund).mock.calls[0]![0];
    expect(args.order.id).toBe('o_test');
    expect(args.actorId).toBe('u_admin');
  });

  it('partial refund → restore wallet PAS appelée, walletRestoredCents 0', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(
      makeReq({ amountCents: 3000 }), // partial $30 of $80
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.walletRestoredCents).toBe(0);
    expect(restoreWalletCreditOnFullRefund).not.toHaveBeenCalled();
  });

  it('full refund mais helper retourne 0 (rien à restaurer / échec non-fatal) → 200, walletRestoredCents 0', async () => {
    // Le helper gère en interne le no-wallet ET l'échec non-fatal (testé à part) ;
    // côté route, il retourne juste 0 et la commande reste 200.
    vi.mocked(restoreWalletCreditOnFullRefund).mockResolvedValueOnce(0);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.walletRestoredCents).toBe(0);
  });

  it('audit log inclut walletRestoredCents (du helper) + walletCreditAppliedCents', async () => {
    vi.mocked(restoreWalletCreditOnFullRefund).mockResolvedValueOnce(2000);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    expect(recordAdminAudit).toHaveBeenCalledOnce();
    const args = vi.mocked(recordAdminAudit).mock.calls[0]![0];
    expect(args.data?.walletRestoredCents).toBe(2000);
    expect(args.data?.walletCreditAppliedCents).toBe(2000);
  });

  it('amountCents exact = order.amountCents traité comme full refund → helper appelé', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(
      makeReq({ amountCents: 8000 }), // exactement order.amountCents
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(restoreWalletCreditOnFullRefund).toHaveBeenCalledOnce();
  });

  it('200 + markRefundIssued appelé avec refund.id', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    expect(markRefundIssued).toHaveBeenCalledWith({
      orderId: 'o_test',
      refundId: 're_test_123',
    });
  });

  it('200 + cancelOrder=true → markOrderFailed appelé', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(
      makeReq({ cancelOrder: true, reason: 'Customer cancelled' }),
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(markOrderFailed).toHaveBeenCalledOnce();
  });

  it('200 + cancelOrder=false (default) → pas de markOrderFailed', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    expect(markOrderFailed).not.toHaveBeenCalled();
  });

  it('200 + email refund-issued envoyé au customer', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(makeReq({ reason: 'Refund test' }), { params: Promise.resolve({ id: 'o_test' }) });
    expect(sendRefundIssuedEmail).toHaveBeenCalledOnce();
    const args = vi.mocked(sendRefundIssuedEmail).mock.calls[0]![0];
    expect(args.user).toEqual(ORDER_BASE.user);
    expect(args.refundAmountCents).toBe(8000); // = order.amountCents
  });

  it('200 + audit log ADMIN_MANUAL_REFUND avec details', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(
      makeReq({ amountCents: 5000, reason: 'Partial refund' }),
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(recordAdminAudit).toHaveBeenCalledOnce();
    const args = vi.mocked(recordAdminAudit).mock.calls[0]![0];
    expect(args.kind).toBe('ADMIN_MANUAL_REFUND');
    expect(args.adminId).toBe('u_admin');
    expect(args.targetId).toBe('o_test');
    expect(args.data?.refundAmountCents).toBe(5000);
    expect(args.data?.partial).toBe(true);
    expect(args.data?.customerEmail).toBe('customer@plio.ca');
  });
});
