/**
 * PATCH /api/admin/reseller-applications/[id] action=approve (Round 4 #2).
 *
 * Vérifie que l'approbation : (1) débloque User.resellerStatus=VERIFIED dans la
 * même transaction quand un compte existe (et seulement s'il n'est pas déjà
 * VERIFIED/PLATINUM), (2) envoie l'email de décision, (3) reste valide même
 * sans compte lié (email envoyé, pas de user.update).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => {
  const tx = vi.fn(async (ops: unknown[]) => ops);
  return {
    prisma: {
      resellerApplication: { findUnique: vi.fn(), update: vi.fn() },
      user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      adminAuditEvent: { create: vi.fn(async () => ({})) },
      $transaction: tx,
    },
  };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/emails/send', () => ({
  sendResellerApprovedEmail: vi.fn(async () => ({ sent: true })),
}));

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { sendResellerApprovedEmail } from '@/lib/emails/send';

const APP = {
  id: 'app_1',
  email: 'reseller@studio.ca',
  contactName: 'Sophie Beauchamp',
  companyName: 'Studio Beauchamp',
  status: 'PENDING',
};

function primeAdmin() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: 'admin_1', email: 'admin@plio.ca', role: 'ADMIN' },
  } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
  } as never);
  vi.mocked(prisma.resellerApplication.findUnique).mockResolvedValue(APP as never);
  vi.mocked(prisma.resellerApplication.update).mockResolvedValue({ ...APP, status: 'APPROVED' } as never);
  vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u_applicant' } as never);
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/reseller-applications/app_1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: 'app_1' }) };

async function importPatch() {
  vi.resetModules();
  return (await import('@/app/api/admin/reseller-applications/[id]/route')).PATCH;
}

beforeEach(() => vi.clearAllMocks());

describe('PATCH reseller-applications approve', () => {
  it('compte existant NONE → user passe VERIFIED + email envoyé', async () => {
    primeAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: 'u_applicant', resellerStatus: 'NONE', resellerDetectedAt: null,
    } as never);

    const PATCH = await importPatch();
    const res = await PATCH(makeReq({ action: 'approve' }), ctx as never);
    expect(res.status).toBe(200);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const upd = vi.mocked(prisma.user.update).mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'u_applicant' });
    expect(upd.data.resellerStatus).toBe('VERIFIED');

    expect(sendResellerApprovedEmail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendResellerApprovedEmail).mock.calls[0][0];
    expect(mail.to).toBe('reseller@studio.ca');
    expect(mail.companyName).toBe('Studio Beauchamp');
  });

  it('aucun compte lié → pas de user.update, mais email quand même + 200', async () => {
    primeAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null as never);

    const PATCH = await importPatch();
    const res = await PATCH(makeReq({ action: 'approve' }), ctx as never);
    expect(res.status).toBe(200);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(sendResellerApprovedEmail).toHaveBeenCalledTimes(1);
  });

  it('compte déjà VERIFIED → pas de downgrade ni re-update', async () => {
    primeAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: 'u_applicant', resellerStatus: 'VERIFIED', resellerDetectedAt: new Date(0),
    } as never);

    const PATCH = await importPatch();
    const res = await PATCH(makeReq({ action: 'approve' }), ctx as never);
    expect(res.status).toBe(200);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('PLATINUM → jamais rétrogradé en VERIFIED', async () => {
    primeAdmin();
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce({
      id: 'u_applicant', resellerStatus: 'PLATINUM', resellerDetectedAt: new Date(0),
    } as never);

    const PATCH = await importPatch();
    const res = await PATCH(makeReq({ action: 'approve' }), ctx as never);
    expect(res.status).toBe(200);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
