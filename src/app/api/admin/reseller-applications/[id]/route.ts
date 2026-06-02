/**
 * PATCH /api/admin/reseller-applications/[id]
 *
 * Actions admin sur une demande reseller :
 *   - approve : status → APPROVED + decidedAt
 *   - reject  : status → REJECTED + decidedAt + adminNote optional
 *   - note    : update adminNotes uniquement
 *   - archive : status → ARCHIVED (pour les vieilles entrées)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), adminNotes: z.string().max(500).optional() }),
  z.object({ action: z.literal('archive') }),
  z.object({ action: z.literal('note'), adminNotes: z.string().max(2000) }),
]);

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const existing = await prisma.resellerApplication.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Application introuvable' }, { status: 404 });
  }

  const now = new Date();
  let updated;
  let resellerUnlocked = false;
  if (body.action === 'approve') {
    // Approuver = débloquer le pricing reseller. AVANT, on ne flippait que le
    // statut de l'application : User.resellerStatus restait NONE (perks jamais
    // débloqués) et le client n'était pas notifié. L'application n'a pas de
    // userId → on lie par email (la dedup key). Si un compte existe, on le passe
    // VERIFIED dans la MÊME transaction que l'application (atomique). Pas de
    // downgrade si déjà VERIFIED/PLATINUM.
    const user = await prisma.user.findFirst({
      where: { email: existing.email },
      select: { id: true, resellerStatus: true, resellerDetectedAt: true },
    });
    const shouldUnlock =
      !!user && user.resellerStatus !== 'VERIFIED' && user.resellerStatus !== 'PLATINUM';

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.resellerApplication.update({
        where: { id },
        data: { status: 'APPROVED', decidedAt: now },
      }),
    ];
    if (shouldUnlock) {
      ops.push(
        prisma.user.update({
          where: { id: user!.id },
          data: {
            resellerStatus: 'VERIFIED',
            resellerDetectedAt: user!.resellerDetectedAt ?? now,
          },
        }),
      );
    }
    const results = await prisma.$transaction(ops);
    updated = results[0] as typeof existing;
    resellerUnlocked = shouldUnlock;

    // Email de décision (best-effort, HORS transaction — ne doit pas bloquer ni
    // annuler l'approbation si SES est down).
    try {
      const { sendResellerApprovedEmail } = await import('@/lib/emails/send');
      await sendResellerApprovedEmail({
        to: existing.email,
        contactName: existing.contactName,
        companyName: existing.companyName,
      });
    } catch {
      // best-effort : l'approbation reste valide même si l'email échoue
    }
  } else if (body.action === 'reject') {
    updated = await prisma.resellerApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedAt: now,
        ...(body.adminNotes !== undefined && { adminNotes: body.adminNotes }),
      },
    });
  } else if (body.action === 'archive') {
    updated = await prisma.resellerApplication.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  } else {
    updated = await prisma.resellerApplication.update({
      where: { id },
      data: { adminNotes: body.adminNotes },
    });
  }

  void recordAdminAudit({
    kind: 'ADMIN_RESELLER_DECISION', // Round 1 audit — kind dédié (était ADMIN_TEMPLATE_EDIT)
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: id,
    data: {
      action: `RESELLER_${body.action.toUpperCase()}`,
      applicationId: id,
      companyName: existing.companyName,
      previousStatus: existing.status,
      newStatus: updated.status,
      ...(body.action === 'approve' ? { resellerUnlocked } : {}),
    },
  });

  return NextResponse.json({ ok: true, application: updated });
});
