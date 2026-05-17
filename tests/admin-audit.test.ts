/**
 * Tests pour recordAdminAudit — best-effort logging des actions admin.
 * Le helper ne doit JAMAIS throw, même si la DB est down.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    adminAuditEvent: {
      create: vi.fn(async () => ({ id: 'evt_x' })),
    },
  },
}));

import { prisma } from '@/lib/db';
import { recordAdminAudit } from '@/lib/db/admin-audit';

describe('recordAdminAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('insert avec adminEmail lowercased + data JSON-stringified', async () => {
    await recordAdminAudit({
      kind: 'ADMIN_VIEW_AS_USER',
      adminId: 'admin_1',
      adminEmail: 'Admin@Plio.CA',
      targetType: 'USER',
      targetId: 'user_target',
      data: { page: '/orders', extra: 42 },
    });

    expect(prisma.adminAuditEvent.create).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(args.data).toMatchObject({
      kind: 'ADMIN_VIEW_AS_USER',
      adminId: 'admin_1',
      adminEmail: 'admin@plio.ca',
      targetType: 'USER',
      targetId: 'user_target',
    });
    expect(JSON.parse(args.data.data as string)).toEqual({ page: '/orders', extra: 42 });
  });

  it('data=null si pas de contexte fourni', async () => {
    await recordAdminAudit({
      kind: 'ADMIN_MANUAL_CANCEL',
      adminId: 'admin_1',
      adminEmail: 'admin@plio.ca',
      targetType: 'ORDER',
      targetId: 'order_x',
    });
    const args = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(args.data.data).toBeNull();
  });

  it('NE THROW PAS si la DB échoue (best-effort logging)', async () => {
    vi.mocked(prisma.adminAuditEvent.create).mockRejectedValueOnce(
      new Error('DB connection lost'),
    );

    // Si ce call throw, le test fail — vitest catch les exceptions async.
    await expect(
      recordAdminAudit({
        kind: 'ADMIN_VIEW_AS_USER',
        adminId: 'admin_1',
        adminEmail: 'admin@plio.ca',
        targetType: 'USER',
        targetId: 'user_x',
      }),
    ).resolves.toBeUndefined();
  });

  it('accepte tous les kind valides', async () => {
    const kinds = [
      'ADMIN_VIEW_AS_USER',
      'ADMIN_MANUAL_REFUND',
      'ADMIN_MANUAL_CANCEL',
      'ADMIN_RESEND_EMAIL',
      'ADMIN_TEMPLATE_EDIT',
      'ADMIN_REPLAY_SINALITE',
    ] as const;
    for (const kind of kinds) {
      await recordAdminAudit({
        kind,
        adminId: 'a',
        adminEmail: 'a@b.c',
      });
    }
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledTimes(kinds.length);
  });
});
