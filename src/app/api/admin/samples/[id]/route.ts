/**
 * PATCH /api/admin/samples/[id]
 *
 * Actions admin sur une demande d'échantillons :
 *   - ship   : status SHIPPED + trackingNumber? + shippedAt = now
 *   - cancel : status CANCELLED
 *   - note   : update adminNotes (free-text)
 *
 * Body : { action: 'ship'|'cancel'|'note', trackingNumber?, adminNotes? }
 *
 * Tout est audité via AdminAuditEvent (kind = ADMIN_TEMPLATE_EDIT par
 * cohérence avec d'autres routes — pas d'enum spécifique pour samples
 * encore, peut être ajouté).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ship'),
    trackingNumber: z.string().max(100).nullable().optional(),
  }),
  z.object({ action: z.literal('cancel') }),
  z.object({
    action: z.literal('note'),
    adminNotes: z.string().max(2000),
  }),
]);

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const existing = await prisma.sampleRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  }

  let updated;
  if (body.action === 'ship') {
    updated = await prisma.sampleRequest.update({
      where: { id },
      data: {
        status: 'SHIPPED',
        trackingNumber: body.trackingNumber ?? null,
        shippedAt: new Date(),
      },
    });
  } else if (body.action === 'cancel') {
    updated = await prisma.sampleRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  } else {
    updated = await prisma.sampleRequest.update({
      where: { id },
      data: { adminNotes: body.adminNotes },
    });
  }

  await recordAdminAudit({
    kind: 'ADMIN_TEMPLATE_EDIT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER', // existing enum, pas de SAMPLE_REQUEST encore
    targetId: id,
    data: {
      action: `SAMPLE_${body.action.toUpperCase()}`,
      sampleRequestId: id,
      previousStatus: existing.status,
      newStatus: updated.status,
      ...(body.action === 'ship' ? { trackingNumber: body.trackingNumber } : {}),
    },
  });

  return NextResponse.json({ ok: true, request: updated });
});
