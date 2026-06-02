/**
 * POST /api/admin/reviews/bulk
 *
 * Bulk-update plusieurs reviews en une requête. Actions :
 *   - approve : status PENDING|REJECTED → APPROVED + publishedAt = now
 *   - reject  : status → REJECTED (avec adminNote optionnelle)
 *   - feature : isFeatured = true/false
 *
 * Body : { ids: string[], action, adminNote?, isFeatured? }
 *
 * Cap à 100 IDs par requête (safety guardrail + UX — au-delà l'admin
 * devrait probablement utiliser un filtre + bulk dynamique). Atomic via
 * Prisma updateMany — soit toutes les rows passent, soit aucune (l'admin
 * peut filter avant pour vérifier). On compte les rows affectées et on
 * retourne le compte au client pour feedback.
 *
 * Audit : un seul AdminAuditEvent kind="ADMIN_REVIEW_BULK" avec data
 * = { action, ids[], count }. Évite N inserts dans la table d'audit qui
 * deviendrait bruyante.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    ids: z.array(z.string().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal('reject'),
    ids: z.array(z.string().min(1)).min(1).max(100),
    adminNote: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('feature'),
    ids: z.array(z.string().min(1)).min(1).max(100),
    isFeatured: z.boolean(),
  }),
]);

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);

  let count = 0;
  if (body.action === 'approve') {
    const result = await prisma.review.updateMany({
      where: { id: { in: body.ids } },
      data: {
        status: 'APPROVED',
        publishedAt: new Date(),
        adminNote: null,
      },
    });
    count = result.count;
  } else if (body.action === 'reject') {
    const result = await prisma.review.updateMany({
      where: { id: { in: body.ids } },
      data: {
        status: 'REJECTED',
        adminNote: body.adminNote ?? null,
        publishedAt: null,
      },
    });
    count = result.count;
  } else {
    const result = await prisma.review.updateMany({
      where: { id: { in: body.ids } },
      data: { isFeatured: body.isFeatured },
    });
    count = result.count;
  }

  void recordAdminAudit({
    kind: 'ADMIN_REVIEW_MODERATE', // Round 1 audit — cohérent avec la modération unitaire
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    data: {
      action: `REVIEW_BULK_${body.action.toUpperCase()}`,
      ids: body.ids,
      count,
      ...(body.action === 'reject' ? { adminNote: body.adminNote } : {}),
      ...(body.action === 'feature' ? { isFeatured: body.isFeatured } : {}),
    },
  });

  return NextResponse.json({ ok: true, count, action: body.action });
});
