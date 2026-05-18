/**
 * POST /api/admin/users/bulk
 *
 * Actions bulk sur N utilisateurs sélectionnés dans /admin/users.
 *
 * Actions :
 *   - set-role         : USER | ADMIN — change role pour tous les userIds
 *   - opt-out-emails   : emailDeliveryNotifications = false
 *   - opt-in-emails    : emailDeliveryNotifications = true
 *
 * Guardrails :
 *   - Max 500 userIds par requête (sinon timeout + UI laggy)
 *   - On ne touche pas à soi-même (anti foot-gun : empêcher un admin de
 *     se dégrader USER et perdre l'accès à l'admin)
 *   - Audit log avec full liste des userIds affectés (traçabilité)
 *
 * Atomicité : updateMany — Prisma garantit que c'est en transaction
 * sous-jacente (1 seul UPDATE SQL).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const MAX_BULK = 500;

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set-role'),
    userIds: z.array(z.string().min(1)).min(1).max(MAX_BULK),
    role: z.enum(['USER', 'ADMIN']),
  }),
  z.object({
    action: z.literal('opt-out-emails'),
    userIds: z.array(z.string().min(1)).min(1).max(MAX_BULK),
  }),
  z.object({
    action: z.literal('opt-in-emails'),
    userIds: z.array(z.string().min(1)).min(1).max(MAX_BULK),
  }),
]);

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);

  // Exclude self : un admin ne peut pas se dégrader par accident
  const selfId = guard.userId;
  const targetIds = body.userIds.filter((id) => id !== selfId);
  const excludedSelf = targetIds.length !== body.userIds.length;

  if (targetIds.length === 0) {
    return NextResponse.json(
      { error: 'Aucun utilisateur à modifier (tu ne peux pas te modifier toi-même via bulk).' },
      { status: 400 },
    );
  }

  let result: { count: number };
  if (body.action === 'set-role') {
    result = await prisma.user.updateMany({
      where: { id: { in: targetIds } },
      data: { role: body.role },
    });
  } else if (body.action === 'opt-out-emails') {
    result = await prisma.user.updateMany({
      where: { id: { in: targetIds } },
      data: { emailDeliveryNotifications: false },
    });
  } else {
    result = await prisma.user.updateMany({
      where: { id: { in: targetIds } },
      data: { emailDeliveryNotifications: true },
    });
  }

  void recordAdminAudit({
    kind: 'ADMIN_TEMPLATE_EDIT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    data: {
      action: `USER_BULK_${body.action.toUpperCase()}`,
      ...(body.action === 'set-role' && { role: body.role }),
      requestedCount: body.userIds.length,
      affectedCount: result.count,
      excludedSelf,
      // Limit to 50 IDs for audit log to avoid bloating the row
      userIds: targetIds.slice(0, 50),
      ...(targetIds.length > 50 && { userIdsTruncated: targetIds.length - 50 }),
    },
  });

  return NextResponse.json({
    ok: true,
    affected: result.count,
    excludedSelf,
  });
});
