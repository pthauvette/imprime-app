/**
 * PATCH /api/admin/reviews/[id]
 *
 * Modération d'une review. Actions :
 *   - approve : status PENDING → APPROVED + publishedAt = now
 *   - reject : status → REJECTED + adminNote (raison)
 *   - feature : isFeatured = true/false (toggle top-3 sur landing)
 *   - reply   : adminReply = string + adminReplyAt = now (Round 25 #4)
 *               Si adminReply = "" (vide) → clear la réponse (null + null)
 *
 * Body : { action: 'approve'|'reject'|'feature'|'reply', adminNote?, isFeatured?, adminReply? }
 */

import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), adminNote: z.string().max(500).optional() }),
  z.object({ action: z.literal('feature'), isFeatured: z.boolean() }),
  // Round 25 #4 — reply public Trustpilot-style. String vide = clear.
  z.object({ action: z.literal('reply'), adminReply: z.string().max(1500) }),
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
  } else if (body.action === 'feature') {
    updated = await prisma.review.update({
      where: { id },
      data: { isFeatured: body.isFeatured },
    });
  } else {
    // Round 25 #4 — reply (string non-vide = post / mise à jour ;
    // string vide = clear la réponse + reset le timestamp).
    const trimmed = body.adminReply.trim();
    updated = await prisma.review.update({
      where: { id },
      data: trimmed
        ? { adminReply: trimmed, adminReplyAt: new Date() }
        : { adminReply: null, adminReplyAt: null },
    });
  }

  await recordAdminAudit({
    kind: 'ADMIN_REVIEW_MODERATE', // Round 1 audit — kind dédié (était ADMIN_TEMPLATE_EDIT)
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'REVIEW', // §8.6 — type dédié (le lien « Cible » pointait la commande)
    targetId: id,
    data: {
      action: `REVIEW_${body.action.toUpperCase()}`,
      reviewId: id,
      orderId: existing.orderId,
      previousStatus: existing.status,
      newStatus: updated.status,
      rating: existing.rating,
    },
  });

  // Audit v2 #10.1 — invalide le cache reviews de la landing (unstable_cache
  // tag 'reviews') pour que l'approbation / feature / reply apparaisse tout de
  // suite, sans attendre le revalidate de 10 min.
  revalidateTag('reviews');

  return NextResponse.json({ ok: true, review: updated });
});
