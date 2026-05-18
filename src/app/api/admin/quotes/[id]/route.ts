/**
 * PATCH /api/admin/quotes/[id]
 *
 * Actions admin sur une demande de devis sur-mesure :
 *   - quoted  : status → QUOTED + quotedAt + adminResponse (le quote envoyé)
 *   - accept  : status → ACCEPTED + decidedAt (customer a confirmé)
 *   - reject  : status → REJECTED + decidedAt + adminNotes optional
 *   - archive : status → ARCHIVED (closed sans suite)
 *   - note    : update adminNotes uniquement (pas de changement de status)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('quoted'), adminResponse: z.string().min(1).max(5000) }),
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('reject'), adminNotes: z.string().max(500).optional() }),
  z.object({ action: z.literal('archive') }),
  z.object({ action: z.literal('note'), adminNotes: z.string().max(2000) }),
]);

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const existing = await prisma.customQuoteRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  }

  const now = new Date();
  let updated;
  if (body.action === 'quoted') {
    updated = await prisma.customQuoteRequest.update({
      where: { id },
      data: { status: 'QUOTED', quotedAt: now, adminResponse: body.adminResponse },
    });
  } else if (body.action === 'accept') {
    updated = await prisma.customQuoteRequest.update({
      where: { id },
      data: { status: 'ACCEPTED', decidedAt: now },
    });
  } else if (body.action === 'reject') {
    updated = await prisma.customQuoteRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedAt: now,
        ...(body.adminNotes !== undefined && { adminNotes: body.adminNotes }),
      },
    });
  } else if (body.action === 'archive') {
    updated = await prisma.customQuoteRequest.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  } else {
    updated = await prisma.customQuoteRequest.update({
      where: { id },
      data: { adminNotes: body.adminNotes },
    });
  }

  void recordAdminAudit({
    kind: 'ADMIN_TEMPLATE_EDIT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: id,
    data: {
      action: `QUOTE_${body.action.toUpperCase()}`,
      requestId: id,
      email: existing.email,
      projectType: existing.projectType,
      previousStatus: existing.status,
      newStatus: updated.status,
    },
  });

  return NextResponse.json({ ok: true, request: updated });
});
