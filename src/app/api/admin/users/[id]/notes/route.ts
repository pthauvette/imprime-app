/**
 * PATCH /api/admin/users/[id]/notes
 *
 * Met à jour les notes admin sur un User. Free-text, max 5000 chars.
 * Audit log via recordAdminAudit kind=ADMIN_USER_NOTES_UPDATE.
 *
 * Body : { notes: string | null }  — null efface
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.object({
  notes: z.string().max(5000).nullable(),
});

export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { id } = await ctx.params;
    const body = await parseBody(req, BodySchema);
    const trimmed = body.notes?.trim() ?? null;
    const effective = trimmed && trimmed.length > 0 ? trimmed : null;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, adminNotes: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const previous = user.adminNotes;

    await prisma.user.update({
      where: { id },
      data: {
        adminNotes: effective,
        adminNotesUpdatedAt: new Date(),
        adminNotesUpdatedBy: guard.user.email,
      },
    });

    await recordAdminAudit({
      kind: 'ADMIN_USER_NOTES_UPDATE',
      adminId: guard.userId,
      adminEmail: guard.user.email,
      targetType: 'USER',
      targetId: id,
      data: {
        previousLength: previous?.length ?? 0,
        nextLength: effective?.length ?? 0,
        cleared: effective === null,
      },
    });

    return NextResponse.json({ ok: true, notes: effective });
  },
);
