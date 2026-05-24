/**
 * POST /api/admin/users/[id]/reseller-status
 *
 * Round 22 #1 — admin manual control sur le resellerStatus du user.
 *
 * Body : { status: 'NONE' | 'AUTO_DETECTED' | 'VERIFIED' }
 *
 * Cas d'usage :
 *   - Admin valide un reseller AUTO_DETECTED → bascule VERIFIED
 *     (perks débloqués au prochain checkout)
 *   - Admin révoque un reseller VERIFIED suspect → bascule NONE
 *     (le cron mensuel ne pourra pas le rebasculer en AUTO si
 *     count < 5, mais s'il atteint 5+ orders, il sera AUTO_DETECTED again)
 *   - Admin force VERIFIED sur un user qui n'a pas encore 5 orders
 *     (cas spécial : nouveau partenaire B2B signé via sales)
 *
 * Workflow garde : VERIFIED ne se déclasse jamais automatiquement via
 * cron (cf /api/cron/reseller-detection). Seul cet endpoint admin peut
 * le faire.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.object({
  // Round 33 — PLATINUM tier accepté (admin peut forcer, sinon promotion auto
  // via cron reseller-detection quand revenue 365j ≥ 20 000 $).
  status: z.enum(['NONE', 'AUTO_DETECTED', 'VERIFIED', 'PLATINUM']),
});

export const POST = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id: userId } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, resellerStatus: true, resellerDetectedAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User introuvable' }, { status: 404 });
  }

  // Skip si pas de changement (pas d'audit row inutile)
  if (user.resellerStatus === body.status) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const now = new Date();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      resellerStatus: body.status,
      // Si on flip vers AUTO_DETECTED ou VERIFIED et detectedAt absent,
      // on stamp maintenant. Si on bascule NONE → nullify.
      resellerDetectedAt: body.status === 'NONE'
        ? null
        : (user.resellerDetectedAt ?? now),
    },
  });

  void recordAdminAudit({
    kind: 'ADMIN_RESELLER_STATUS_CHANGE',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: userId,
    data: {
      userEmail: user.email,
      previousStatus: user.resellerStatus,
      newStatus: body.status,
    },
  });

  return NextResponse.json({
    ok: true,
    user: { id: updated.id, resellerStatus: updated.resellerStatus, resellerDetectedAt: updated.resellerDetectedAt },
  });
});
