/**
 * POST /api/admin/orders/bulk
 *
 * Bulk actions admin sur plusieurs commandes. Body :
 *   { ids: string[], action, ...params }
 *
 * Actions :
 *   - note   : append à adminNotes (multi-line, préfixé par date + admin)
 *   - export : retourne CSV inline (alternative au filter export)
 *
 * Pour MVP : pas de bulk status change (risque trop élevé de fuck up le
 * lifecycle order). L'admin doit changer status via /admin/orders/[id]
 * où on a full context.
 *
 * Cap 100 ids par requête.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('note'),
    ids: z.array(z.string().min(1)).min(1).max(100),
    note: z.string().min(1).max(1000),
  }),
]);

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);

  let count = 0;
  if (body.action === 'note') {
    // Append note préfixée date + admin (les vieilles notes restent)
    const prefix = `\n\n[${new Date().toISOString().slice(0, 10)} · ${guard.user.email}] `;
    // Tx pour atomicité — Prisma n'a pas de update many avec concat,
    // donc on fetch + update individuellement dans une tx.
    const existing = await prisma.order.findMany({
      where: { id: { in: body.ids } },
      select: { id: true, adminNotes: true },
    });
    await prisma.$transaction(
      existing.map((o) =>
        prisma.order.update({
          where: { id: o.id },
          data: {
            adminNotes: (o.adminNotes ?? '') + prefix + body.note,
          },
        }),
      ),
    );
    count = existing.length;
  }

  void recordAdminAudit({
    kind: 'ADMIN_TEMPLATE_EDIT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    data: {
      action: `ORDER_BULK_${body.action.toUpperCase()}`,
      ids: body.ids,
      count,
    },
  });

  return NextResponse.json({ ok: true, count });
});
