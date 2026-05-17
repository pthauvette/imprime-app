/**
 * PATCH /api/admin/reviews/[id]
 *
 * Modération d'une review. Actions :
 *   - approve : status PENDING → APPROVED + publishedAt = now
 *   - reject : status → REJECTED + adminNote (raison)
 *   - feature : isFeatured = true/false (toggle top-3 sur landing)
 *
 * Body : { action: 'approve'|'reject'|'feature', adminNote?, isFeatured? }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), adminNote: z.string().max(500).optional() }),
  z.object({ action: z.literal('feature'), isFeatured: z.boolean() }),
]);

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Review introuvable' }, { status: 404 });
  }

  let updated;
  if (body.action === 'approve') {
    updated = await prisma.review.update({
      where: { id },
      data: {
        status: 'APPROVED',
        publishedAt: existing.publishedAt ?? new Date(),
        adminNote: null,
      },
    });
  } else if (body.action === 'reject') {
    updated = await prisma.review.update({
      where: { id },
      data: {
        status: 'REJECTED',
        adminNote: body.adminNote ?? null,
        publishedAt: null,
      },
    });
  } else {
    // feature toggle
    updated = await prisma.review.update({
      where: { id },
      data: { isFeatured: body.isFeatured },
    });
  }

  void recordAdminAudit({
    kind: 'ADMIN_TEMPLATE_EDIT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER', // existing enum, review attached to order
    targetId: existing.orderId,
    data: {
      action: `REVIEW_${body.action.toUpperCase()}`,
      reviewId: id,
      previousStatus: existing.status,
      newStatus: updated.status,
      rating: existing.rating,
    },
  });

  return NextResponse.json({ ok: true, review: updated });
});
