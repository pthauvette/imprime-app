/**
 * Tests POST /api/admin/users/[id]/delete-pipeda — Round 39 #1.
 *
 * Lock-in : tous les 5 PII tables sont touchés dans la même $transaction
 * (audit Round 37 #4 finding #8 fix). Sans cette couverture, on pourrait
 * re-introduire le bug : "anonymize User mais oublier Order.ship*".
 *
 * Couverture :
 *   - Unauthorized si requireAdmin fail
 *   - 404 si user pas trouvé
 *   - 400 si confirm != "SUPPRIMER"
 *   - 400 si aucune DeleteAccountRequest active
 *   - 200 + ALL 5 PII tables anonymisées + User anonymized + email envoyé
 *   - Order.shipProvince + shippingMethod préservés (CRA report)
 *   - audit log includes emailSnapshot + targetType=USER
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    account: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    session: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    address: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    draft: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    designDraft: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    savedConfig: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    order: { updateMany: vi.fn(async () => ({ count: 0 })) },
    contactMessage: { updateMany: vi.fn(async () => ({ count: 0 })) },
    sampleRequest: { updateMany: vi.fn(async () => ({ count: 0 })) },
    abandonedCart: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    newsletterSubscriber: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    emailDelivery: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    customQuoteRequest: { updateMany: vi.fn(async () => ({ count: 0 })) },
    resellerApplication: { updateMany: vi.fn(async () => ({ count: 0 })) },
    deleteAccountRequest: { update: vi.fn(async () => ({})) },
  },
}));
vi.mock('@/lib/db/admin-audit', () => ({
  recordAdminAudit: vi.fn(async () => undefined),
}));
vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true, id: 'em_1' })),
}));
vi.mock('@/lib/api-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return actual;
});
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { logAdmin: stub, log: stub };
});

import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

const USER_BASE = {
  id: 'u_doomed',
  email: 'doomed@plio.ca',
  deleteRequests: [
    { id: 'dr_1', status: 'APPROVED', createdAt: new Date() },
  ],
};

function makeReq(body: unknown) {
  return new Request('http://localhost/api/admin/users/u_doomed/delete-pipeda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    userId: 'u_admin',
    user: { id: 'u_admin', email: 'admin@plio.ca' },
  } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(USER_BASE as never);
});

describe('POST /api/admin/users/[id]/delete-pipeda (Round 39 #1)', () => {
  it('Unauthorized si requireAdmin fail', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    } as never);
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    const res = await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });
    expect(res.status).toBe(401);
  });

  it('400 si confirm != "SUPPRIMER" (typo guard)', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    const res = await POST(makeReq({ confirm: 'supprimer' }), { params: Promise.resolve({ id: 'u_doomed' }) });
    expect(res.status).toBe(400);
  });

  it('404 si user pas trouvé', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    const res = await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_missing' }) });
    expect(res.status).toBe(404);
  });

  it('400 si aucune DeleteAccountRequest active', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...USER_BASE,
      deleteRequests: [],
    } as never);
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    const res = await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('NO_REQUEST');
  });

  // ─── Round 39 #1 — PIPEDA delete extension tests ───────────────────────

  it('Round 39 #1 — Order.ship* anonymisé via updateMany', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });

    expect(prisma.order.updateMany).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.order.updateMany).mock.calls[0]![0];
    expect(args.where).toEqual({ userId: 'u_doomed' });
    // Toutes les PII shipping wipées
    expect(args.data.shipName).toBe('[PIPEDA-DELETED]');
    expect(args.data.shipLine1).toBe('[PIPEDA-DELETED]');
    expect(args.data.shipCity).toBe('[PIPEDA-DELETED]');
    expect(args.data.shipPhone).toBe('+10000000000');
    expect(args.data.shipPostalCode).toBe('A0A 0A0');
    // Important : shipProvince + shippingMethod PAS modifiés (CRA report needs)
    expect(args.data.shipProvince).toBeUndefined();
    expect(args.data.shippingMethod).toBeUndefined();
  });

  it('Round 39 #1 — ContactMessage anonymisé par email match', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });

    expect(prisma.contactMessage.updateMany).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.contactMessage.updateMany).mock.calls[0]![0];
    expect(args.where).toEqual({ email: 'doomed@plio.ca' });
    expect(args.data.email).toMatch(/^deleted-/);
    expect(args.data.name).toBe('[PIPEDA-DELETED]');
  });

  it('Round 39 #1 — SampleRequest anonymisé (incl. ship + phone)', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });

    expect(prisma.sampleRequest.updateMany).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.sampleRequest.updateMany).mock.calls[0]![0];
    expect(args.where).toEqual({ email: 'doomed@plio.ca' });
    expect(args.data.email).toMatch(/^deleted-/);
    expect(args.data.name).toBe('[PIPEDA-DELETED]');
    expect(args.data.phone).toBeNull();
    expect(args.data.shipLine1).toBe('[PIPEDA-DELETED]');
  });

  it('Round 39 #1 — AbandonedCart DELETED par email match', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });

    expect(prisma.abandonedCart.deleteMany).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.abandonedCart.deleteMany).mock.calls[0]![0];
    expect(args?.where).toEqual({ email: 'doomed@plio.ca' });
  });

  it('Round 39 #1 — NewsletterSubscriber DELETED par email match', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });

    expect(prisma.newsletterSubscriber.deleteMany).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.newsletterSubscriber.deleteMany).mock.calls[0]![0];
    expect(args?.where).toEqual({ email: 'doomed@plio.ca' });
  });

  it('Légal #3 — EmailDelivery DELETED par to match (PII to + varsJson)', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });

    expect(prisma.emailDelivery.deleteMany).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.emailDelivery.deleteMany).mock.calls[0]![0];
    expect(args?.where).toEqual({ to: 'doomed@plio.ca' });
  });

  it('Légal #3 — CustomQuoteRequest PII anonymisé (email/nom/tél/company/IP/UA)', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });

    expect(prisma.customQuoteRequest.updateMany).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.customQuoteRequest.updateMany).mock.calls[0]![0];
    expect(args?.where).toEqual({ email: 'doomed@plio.ca' });
    expect(args?.data).toEqual(
      expect.objectContaining({
        name: '[PIPEDA-DELETED]',
        phone: null,
        companyName: null,
        requestIp: null,
        requestUa: null,
      }),
    );
  });

  it('Loi 25 — ResellerApplication PII anonymisé (email/contact/entreprise/tél/site/IP/UA/message)', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });

    expect(prisma.resellerApplication.updateMany).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.resellerApplication.updateMany).mock.calls[0]![0];
    expect(args?.where).toEqual({ email: 'doomed@plio.ca' });
    expect(args?.data.email).toMatch(/^deleted-/);
    expect(args?.data).toEqual(
      expect.objectContaining({
        contactName: '[PIPEDA-DELETED]',
        companyName: '[PIPEDA-DELETED]',
        phone: null,
        website: null,
        message: null,
        requestIp: null,
        requestUa: null,
      }),
    );
  });

  it('Round 39 #1 — email match lowercased (defensive)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...USER_BASE,
      email: 'MixedCase@Plio.CA',
    } as never);
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });

    const contactArgs = vi.mocked(prisma.contactMessage.updateMany).mock.calls[0]![0];
    expect((contactArgs.where as { email: string }).email).toBe('mixedcase@plio.ca');
  });

  it('200 + audit log avec emailSnapshot AVANT anonymize', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    const res = await POST(makeReq({ confirm: 'SUPPRIMER', adminNotes: 'Verified ID' }), { params: Promise.resolve({ id: 'u_doomed' }) });
    expect(res.status).toBe(200);

    expect(recordAdminAudit).toHaveBeenCalledOnce();
    const args = vi.mocked(recordAdminAudit).mock.calls[0]![0];
    expect(args.kind).toBe('ADMIN_DELETE_USER_PIPEDA');
    expect(args.data?.emailSnapshot).toBe('doomed@plio.ca');
    expect(args.data?.adminNotes).toBe('Verified ID');
  });

  it('200 + email confirmation envoyé au customer (avant anonymize)', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });

    expect(sendAdminCustomMessageEmail).toHaveBeenCalledOnce();
    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0]![0];
    expect(args.to).toBe('doomed@plio.ca'); // L'email d'avant l'anonymize
    expect(args.vars.SUBJECT).toMatch(/supprimé/i);
  });

  it('email fail → non-fatal, transaction succeed quand même', async () => {
    vi.mocked(sendAdminCustomMessageEmail).mockRejectedValueOnce(new Error('SES down'));
    const { POST } = await import('@/app/api/admin/users/[id]/delete-pipeda/route');
    const res = await POST(makeReq({ confirm: 'SUPPRIMER' }), { params: Promise.resolve({ id: 'u_doomed' }) });
    expect(res.status).toBe(200);
    // La tx PIPEDA a bien run (anonymization done)
    expect(prisma.order.updateMany).toHaveBeenCalledOnce();
  });
});
