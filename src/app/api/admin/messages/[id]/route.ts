/**
 * PATCH /api/admin/messages/[id]
 *
 * Actions admin sur un ContactMessage :
 *   - answered : status OPEN → ANSWERED + answeredAt = now
 *   - close    : status → CLOSED + closedAt = now
 *   - reopen   : status → OPEN (depuis ANSWERED/CLOSED)
 *   - note     : update adminNotes
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('answered') }),
  z.object({ action: z.literal('close') }),
  z.object({ action: z.literal('reopen') }),
  z.object({ action: z.literal('note'), adminNotes: z.string().max(2000) }),
]);

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const existing = await prisma.contactMessage.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
  }

  const now = new Date();
  let updated;
  if (body.action === 'answered') {
    updated = await prisma.contactMessage.update({
      where: { id },
      data: { status: 'ANSWERED', answeredAt: now },
    });
  } else if (body.action === 'close') {
    updated = await prisma.contactMessage.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: now },
    });
  } else if (body.action === 'reopen') {
    updated = await prisma.contactMessage.update({
      where: { id },
      data: { status: 'OPEN', closedAt: null, answeredAt: null },
    });
  } else {
    updated = await prisma.contactMessage.update({
      where: { id },
      data: { adminNotes: body.adminNotes },
    });
  }

  void recordAdminAudit({
    kind: 'ADMIN_TEMPLATE_EDIT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: existing.email,
    data: {
      action: `MESSAGE_${body.action.toUpperCase()}`,
      messageId: id,
      previousStatus: existing.status,
      newStatus: updated.status,
    },
  });

  return NextResponse.json({ ok: true, message: updated });
});
