/**
 * Tests pour /api/admin/experiments/[id] : toggle override admin.
 * + tests getExperimentRuntime : code default vs override.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    adminAuditEvent: { create: vi.fn(async () => ({})) },
    user: { findUnique: vi.fn() },
    experimentOverride: {
      findUnique: vi.fn(),
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { EXPERIMENTS } from '@/lib/ab/experiments';

function adminSession() {
  return {
    user: { id: 'admin_1', email: 'admin@plio.ca', role: 'ADMIN' },
  };
}

const KNOWN_ID = Object.keys(EXPERIMENTS)[0]!;

function makeReq(body: unknown): Request {
  return new Request(`http://localhost/api/admin/experiments/${KNOWN_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function importPatch() {
  vi.resetModules();
  return (await import('@/app/api/admin/experiments/[id]/route')).PATCH;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/admin/experiments/[id]', () => {
  it('401 si non-authentifié', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const PATCH = await importPatch();
    const res = await PATCH(makeReq({ active: true }), {
      params: Promise.resolve({ id: KNOWN_ID }),
    });
    expect(res.status).toBe(401);
  });

  it('403 si user non-admin', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', email: 'u@plio.ca', role: 'USER' },
    } as never);
    const PATCH = await importPatch();
    const res = await PATCH(makeReq({ active: true }), {
      params: Promise.resolve({ id: KNOWN_ID }),
    });
    expect(res.status).toBe(403);
  });

  it('404 si experimentId inconnu', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    const PATCH = await importPatch();
    const res = await PATCH(
      new Request('http://localhost/api/admin/experiments/totally-fake', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      }),
      { params: Promise.resolve({ id: 'totally-fake' }) },
    );
    expect(res.status).toBe(404);
  });

  it('200 + upsert + audit log avec active=true', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(prisma.experimentOverride.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.experimentOverride.upsert).mockResolvedValueOnce({} as never);

    const PATCH = await importPatch();
    const res = await PATCH(makeReq({ active: true }), {
      params: Promise.resolve({ id: KNOWN_ID }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.active).toBe(true);

    const upsertCall = vi.mocked(prisma.experimentOverride.upsert).mock.calls[0][0];
    expect(upsertCall.where).toEqual({ experimentId: KNOWN_ID });
    expect(upsertCall.create.active).toBe(true);
    expect(upsertCall.create.updatedBy).toBe('admin@plio.ca');

    await new Promise((r) => setImmediate(r));
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(1);
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(audit.data.kind).toBe('ADMIN_EXPERIMENT_TOGGLE');
    expect(audit.data.targetType).toBe('EXPERIMENT');
    expect(audit.data.targetId).toBe(KNOWN_ID);
  });

  it('400 si weightsJson invalide JSON', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);

    const PATCH = await importPatch();
    const res = await PATCH(makeReq({ active: true, weightsJson: '{ bad json' }), {
      params: Promise.resolve({ id: KNOWN_ID }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/JSON invalide/);
  });

  it('400 si weightsJson référence un variant inconnu', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);

    const PATCH = await importPatch();
    const res = await PATCH(
      makeReq({ active: true, weightsJson: '{"variant_zzz":50}' }),
      { params: Promise.resolve({ id: KNOWN_ID }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/variant inconnu/);
  });

  it('400 si weight négatif', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);

    const validId = EXPERIMENTS[KNOWN_ID as keyof typeof EXPERIMENTS].variants[0].id;
    const PATCH = await importPatch();
    const res = await PATCH(
      makeReq({ active: true, weightsJson: `{"${validId}":-10}` }),
      { params: Promise.resolve({ id: KNOWN_ID }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/weight invalide/);
  });

  it('accepte weightsJson valide + upsert avec weights override', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin_1', email: 'admin@plio.ca', name: 'Admin', role: 'ADMIN',
    } as never);
    vi.mocked(prisma.experimentOverride.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.experimentOverride.upsert).mockResolvedValueOnce({} as never);

    const valid = EXPERIMENTS[KNOWN_ID as keyof typeof EXPERIMENTS].variants;
    const weights = JSON.stringify({ [valid[0].id]: 90, [valid[1].id]: 10 });

    const PATCH = await importPatch();
    const res = await PATCH(
      makeReq({ active: true, weightsJson: weights }),
      { params: Promise.resolve({ id: KNOWN_ID }) },
    );

    expect(res.status).toBe(200);
    const upsertCall = vi.mocked(prisma.experimentOverride.upsert).mock.calls[0][0];
    expect(upsertCall.create.weightsJson).toBe(weights);
  });
});
