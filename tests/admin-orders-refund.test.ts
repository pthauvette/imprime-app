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

// Round 37 #1 — Mock wallet/operations.recordWalletTx pour vérifier
// que le wallet est restauré sur full refund.
vi.mock('@/lib/wallet/operations', () => ({
  recordWalletTx: vi.fn(async () => ({ balanceAfterCents: 0, txId: 'wtx_test' })),
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
import { recordWalletTx } from '@/lib/wallet/operations';
import { sendCriticalAlert } from '@/lib/alerting/slack';

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

  it('400 si refund amount > order total', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(
      makeReq({ amountCents: 9000 }), // > order 8000
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/exceeds/i);
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

  it('Round 37 #1 — full refund + walletApplied > 0 → recordWalletTx REFUND avec amountCents positif', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(
      makeReq({}), // pas d'amountCents = full refund
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.walletRestoredCents).toBe(2000); // $20 restauré

    expect(recordWalletTx).toHaveBeenCalledOnce();
    const args = vi.mocked(recordWalletTx).mock.calls[0]![0];
    expect(args.kind).toBe('REFUND');
    expect(args.amountCents).toBe(2000); // POSITIF (credit back)
    expect(args.userId).toBe('u_owner');
    expect(args.orderId).toBe('o_test');
    expect(args.adminId).toBe('u_admin');
  });

  it('Round 37 #1 — partial refund → wallet NON touché (admin must reconcile manually)', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(
      makeReq({ amountCents: 3000 }), // partial $30 of $80
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.walletRestoredCents).toBe(0);
    expect(recordWalletTx).not.toHaveBeenCalled();
  });

  it('Round 37 #1 — full refund SANS wallet appliqué → pas de recordWalletTx', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      ...ORDER_BASE,
      walletCreditAppliedCents: 0,
    } as never);
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    expect(recordWalletTx).not.toHaveBeenCalled();
  });

  it('Round 37 #1 — wallet restore fail → Stripe refund OK preservé + Slack alert + non-fatal', async () => {
    vi.mocked(recordWalletTx).mockRejectedValueOnce(new Error('DB down'));
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    // Pas un 500 : Stripe refund a réussi, wallet est failure non-fatal
    expect(res.status).toBe(200);
    expect(stripeMock.refunds.create).toHaveBeenCalledOnce();
    expect(sendCriticalAlert).toHaveBeenCalledOnce();
    const alertArgs = vi.mocked(sendCriticalAlert).mock.calls[0]![0];
    expect(alertArgs.title).toMatch(/Wallet restore/i);
    expect(alertArgs.severity).toBe('critical');
  });

  it('Round 37 #1 — audit log inclut walletRestoredCents + walletCreditAppliedCents', async () => {
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(makeReq({}), { params: Promise.resolve({ id: 'o_test' }) });
    expect(recordAdminAudit).toHaveBeenCalledOnce();
    const args = vi.mocked(recordAdminAudit).mock.calls[0]![0];
    expect(args.data?.walletRestoredCents).toBe(2000);
    expect(args.data?.walletCreditAppliedCents).toBe(2000);
  });

  it('Round 37 #1 — amountCents exact = order.amountCents traité comme full refund', async () => {
    // Si admin tape exactement le total Stripe, ça compte comme full → wallet restore
    const { POST } = await import('@/app/api/admin/orders/[id]/refund/route');
    await POST(
      makeReq({ amountCents: 8000 }), // exactement order.amountCents
      { params: Promise.resolve({ id: 'o_test' }) },
    );
    expect(recordWalletTx).toHaveBeenCalledOnce();
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
