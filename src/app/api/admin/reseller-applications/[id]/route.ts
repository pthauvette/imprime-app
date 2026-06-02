/**
 * PATCH /api/admin/reseller-applications/[id]
 *
 * Actions admin sur une demande reseller :
 *   - approve : status → APPROVED + decidedAt
 *   - reject  : status → REJECTED + decidedAt + adminNote optional
 *   - note    : update adminNotes uniquement
 *   - archive : status → ARCHIVED (pour les vieilles entrées)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), adminNotes: z.string().max(500).optional() }),
  z.object({ action: z.literal('archive') }),
  z.object({ action: z.literal('note'), adminNotes: z.string().max(2000) }),
]);

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const existing = await prisma.resellerApplication.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Application introuvable' }, { status: 404 });
  }

  const now = new Date();
  let updated;
  if (body.action === 'approve') {
    updated = await prisma.resellerApplication.update({
      where: { id },
      data: { status: 'APPROVED', decidedAt: now },
    });
  } else if (body.action === 'reject') {
    updated = await prisma.resellerApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedAt: now,
        ...(body.adminNotes !== undefined && { adminNotes: body.adminNotes }),
      },
    });
  } else if (body.action === 'archive') {
    updated = await prisma.resellerApplication.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  } else {
    updated = await prisma.resellerApplication.update({
      where: { id },
      data: { adminNotes: body.adminNotes },
    });
  }

  void recordAdminAudit({
    kind: 'ADMIN_RESELLER_DECISION', // Round 1 audit — kind dédié (était ADMIN_TEMPLATE_EDIT)
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: id,
    data: {
      action: `RESELLER_${body.action.toUpperCase()}`,
      applicationId: id,
      companyName: existing.companyName,
      previousStatus: existing.status,
      newStatus: updated.status,
    },
  });

  return NextResponse.json({ ok: true, application: updated });
});
