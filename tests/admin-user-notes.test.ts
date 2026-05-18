/**
 * Tests pour PATCH /api/admin/users/[id]/notes — update du memo admin
 * sur un User. Vérifie auth, validation, audit log, et le edge case
 * "string vide → null" (trim).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    adminAuditEvent: { create: vi.fn(async () => ({})) },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { auth } from '@/auth';

function adminSession() {
  return {
    user: { id: 'admin_1', email: 'admin@plio.ca', role: 'ADMIN' },
  };
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/users/u1/notes', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function importFresh() {
  vi.resetModules();
  return (await import('@/app/api/admin/users/[id]/notes/route')).PATCH;
}

const targetUser = {
  id: 'u1',
  email: 'customer@example.ca',
  adminNotes: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/admin/users/[id]/notes', () => {
  it('401 si non-authentifié', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const PATCH = await importFresh();
    const res = await PATCH(makeReq({ notes: 'hello' }), { params: Promise.resolve({ id: 'u1' }) });

    expect(res.status).toBe(401);
  });

  it('403 si user non-admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u2', email: 'u@plio.ca', role: 'USER' },
    } as never);

    const PATCH = await importFresh();
    const res = await PATCH(makeReq({ notes: 'hello' }), { params: Promise.resolve({ id: 'u1' }) });

    expect(res.status).toBe(403);
  });

  it('404 si user introuvable', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN' } as never)
      .mockResolvedValueOnce(null);

    const PATCH = await importFresh();
    const res = await PATCH(makeReq({ notes: 'hello' }), { params: Promise.resolve({ id: 'doesnt-exist' }) });

    expect(res.status).toBe(404);
  });

  it('200 + update + audit log avec contenu valide', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN' } as never)
      .mockResolvedValueOnce(targetUser as never);

    const PATCH = await importFresh();
    const res = await PATCH(
      makeReq({ notes: 'Client B2B, payment terms Net 30' }),
      { params: Promise.resolve({ id: 'u1' }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.notes).toBe('Client B2B, payment terms Net 30');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        adminNotes: 'Client B2B, payment terms Net 30',
        adminNotesUpdatedBy: 'admin@plio.ca',
      }),
    });

    // Audit log fire-and-forget
    await new Promise((r) => setImmediate(r));
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(audit.data.kind).toBe('ADMIN_USER_NOTES_UPDATE');
    expect(audit.data.targetId).toBe('u1');
  });

  it('string vide ou whitespace-only → notes=null (clear)', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN' } as never)
      .mockResolvedValueOnce({ ...targetUser, adminNotes: 'old note' } as never);

    const PATCH = await importFresh();
    const res = await PATCH(makeReq({ notes: '   \n  ' }), { params: Promise.resolve({ id: 'u1' }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notes).toBeNull();

    const updateCall = vi.mocked(prisma.user.update).mock.calls[0][0];
    expect(updateCall.data.adminNotes).toBeNull();
  });

  it('explicit null → clear', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN' } as never)
      .mockResolvedValueOnce({ ...targetUser, adminNotes: 'old note' } as never);

    const PATCH = await importFresh();
    const res = await PATCH(makeReq({ notes: null }), { params: Promise.resolve({ id: 'u1' }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notes).toBeNull();
  });

  it('400 si notes > 5000 chars', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);

    const PATCH = await importFresh();
    const res = await PATCH(
      makeReq({ notes: 'x'.repeat(5001) }),
      { params: Promise.resolve({ id: 'u1' }) },
    );

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
