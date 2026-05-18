/**
 * POST /api/admin/orders/bulk
 *
 * Bulk actions admin sur plusieurs commandes. Body :
 *   { ids: string[], action, ...params }
 *
 * Actions :
 *   - note       : append à adminNotes (multi-line, préfixé par date + admin)
 *   - markStatus : transition de status sur N orders. Whitelist :
 *                  IN_PRODUCTION | SHIPPED | DELIVERED (les ops courantes).
 *                  Pas de CANCELLED ou FAILED ici — faut passer par
 *                  /admin/orders/[id] où on a le full context (refund auto).
 *                  Si markStatus=SHIPPED, trackingNumber + carrier optional
 *                  → écrits dans OrderEvent.data pour /track + emails.
 *
 * Cap 100 ids par requête.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BULK_ALLOWED_STATUSES = ['IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] as const;

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('note'),
    ids: z.array(z.string().min(1)).min(1).max(100),
    note: z.string().min(1).max(1000),
  }),
  z.object({
    action: z.literal('markStatus'),
    ids: z.array(z.string().min(1)).min(1).max(100),
    status: z.enum(BULK_ALLOWED_STATUSES),
    trackingNumber: z.string().min(1).max(80).optional(),
    carrier: z.string().min(1).max(40).optional(),
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
  } else if (body.action === 'markStatus') {
    // Bulk status transition. On exclut les orders déjà dans un état
    // terminal (DELIVERED, CANCELLED, FAILED) pour pas régresser
    // accidentellement. Refund n'est PAS déclenché ici — c'est juste
    // un status flip, pas de side-effect Stripe.
    const eligible = await prisma.order.findMany({
      where: {
        id: { in: body.ids },
        status: { notIn: ['DELIVERED', 'CANCELLED', 'FAILED'] },
      },
      select: { id: true, status: true, sinaliteOrderId: true },
    });

    const eventData = JSON.stringify({
      status: body.status,
      ...(body.trackingNumber ? { trackingNumber: body.trackingNumber } : {}),
      ...(body.carrier ? { carrier: body.carrier } : {}),
      source: 'admin_bulk',
    });

    await prisma.$transaction([
      prisma.order.updateMany({
        where: { id: { in: eligible.map((o) => o.id) } },
        data: { status: body.status },
      }),
      // OrderEvent par order pour tracer la transition + permettre
      // /track de récupérer trackingNumber/carrier via le timeline helper.
      prisma.orderEvent.createMany({
        data: eligible.map((o) => ({
          orderId: o.id,
          kind: 'SINALITE_STATUS_CHANGED',
          data: eventData,
        })),
      }),
    ]);
    count = eligible.length;
  }

  void recordAdminAudit({
    kind: 'ADMIN_BULK_STATUS_UPDATE',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    data: {
      action: `ORDER_BULK_${body.action.toUpperCase()}`,
      ids: body.ids,
      count,
      ...(body.action === 'markStatus'
        ? { status: body.status, trackingNumber: body.trackingNumber, carrier: body.carrier }
        : {}),
    },
  });

  return NextResponse.json({ ok: true, count });
});
