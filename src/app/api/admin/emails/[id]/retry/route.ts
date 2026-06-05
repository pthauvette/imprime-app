/**
 * POST /api/admin/emails/[id]/retry
 *
 * Manual retry d'une EmailDelivery FAILED ou DEAD. Bypass le backoff
 * et tente immédiatement.
 *
 * Use case admin : email DEAD après 3 retries auto, Patrick a
 * investigué SES, le problème est réglé, il veut re-tenter manuellement.
 * Ou : un FAILED qui doit partir tout de suite (commande urgente).
 *
 * Pour les DEAD, on remet attempts à maxAttempts-1 pour donner 1 tentative
 * supplémentaire (sinon le processDelivery va re-mark DEAD immédiatement).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { processDelivery } from '@/lib/emails/queue';
import { recordAdminAudit } from '@/lib/db/admin-audit';

export const POST = withErrorHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;

  const delivery = await prisma.emailDelivery.findUnique({ where: { id } });
  if (!delivery) {
    return NextResponse.json({ error: 'Email introuvable' }, { status: 404 });
  }

  if (delivery.status === 'SENT') {
    return NextResponse.json({ error: 'Email déjà envoyé.' }, { status: 400 });
  }

  // Si DEAD : reset attempts à maxAttempts-1 pour donner 1 tentative
  // supplémentaire (sinon processDelivery va re-DEAD immédiatement).
  // Si FAILED : laisse les attempts en place (juste bypass le wait).
  if (delivery.status === 'DEAD') {
    await prisma.emailDelivery.update({
      where: { id },
      data: {
        attempts: Math.max(0, delivery.maxAttempts - 1),
        status: 'FAILED',
        nextAttemptAt: null,
      },
    });
  } else if (delivery.status === 'FAILED') {
    await prisma.emailDelivery.update({
      where: { id },
      data: { nextAttemptAt: null }, // bypass le wait
    });
  }

  // Audit
  await recordAdminAudit({
    kind: 'ADMIN_RESEND_EMAIL',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: delivery.to.toLowerCase(),
    data: {
      action: 'EMAIL_MANUAL_RETRY',
      deliveryId: id,
      template: delivery.template,
      previousStatus: delivery.status,
      previousAttempts: delivery.attempts,
    },
  });

  // Tente l'envoi tout de suite
  const result = await processDelivery(id);

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    deliveryId: id,
  });
});
