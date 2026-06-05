/**
 * POST /api/admin/emails/bulk
 *
 * Bulk-retry plusieurs EmailDelivery FAILED/DEAD. Body : { ids: string[] }.
 *
 * Pour chaque ID :
 *   - skip si déjà SENT (no-op, comptabilisé séparément)
 *   - si DEAD : reset attempts à maxAttempts-1 + status FAILED
 *   - si FAILED : juste bypass le wait (nextAttemptAt = null)
 *   - lance processDelivery() en série pour éviter de spam SES
 *
 * Retour : { ok, attempted, sent, failed, skipped }
 *
 * Cap à 50 IDs par requête — au-delà, le caller devrait fragmenter.
 * Série plutôt que parallèle pour respecter le rate-limit SES (typique
 * 14 emails/sec, mais on reste conservateur en single-thread).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { processDelivery } from '@/lib/emails/queue';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);

  // Fetch toutes les rows pour décider du reset (DEAD vs FAILED).
  const deliveries = await prisma.emailDelivery.findMany({
    where: { id: { in: body.ids } },
  });

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const d of deliveries) {
    if (d.status === 'SENT') {
      skipped++;
      continue;
    }
    if (d.status === 'DEAD') {
      await prisma.emailDelivery.update({
        where: { id: d.id },
        data: {
          attempts: Math.max(0, d.maxAttempts - 1),
          status: 'FAILED',
          nextAttemptAt: null,
        },
      });
    } else if (d.status === 'FAILED' || d.status === 'PENDING') {
      await prisma.emailDelivery.update({
        where: { id: d.id },
        data: { nextAttemptAt: null },
      });
    }
    attempted++;
    const result = await processDelivery(d.id);
    if (result.sent) sent++;
    else failed++;
  }

  await recordAdminAudit({
    kind: 'ADMIN_RESEND_EMAIL',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    data: {
      action: 'EMAIL_BULK_RETRY',
      requested: body.ids.length,
      attempted,
      sent,
      failed,
      skipped,
    },
  });

  return NextResponse.json({ ok: true, attempted, sent, failed, skipped });
});
