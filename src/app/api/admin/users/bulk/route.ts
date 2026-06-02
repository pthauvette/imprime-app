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
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

const MAX_BULK = 500;
// Round 27 #2 — cap email broadcasts plus serré : sender deliverability,
// + on respecte la limite SES "sender / sec" (~14 msg/sec) sans rate-limiter.
const MAX_BULK_EMAIL = 50;

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
  // Round 27 #2 — broadcast custom email aux users sélectionnés.
  z.object({
    action: z.literal('send-email'),
    userIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_EMAIL),
    subject: z.string().trim().min(3).max(150),
    body: z.string().trim().min(10).max(5000),
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
  } else if (body.action === 'opt-in-emails') {
    result = await prisma.user.updateMany({
      where: { id: { in: targetIds } },
      data: { emailDeliveryNotifications: true },
    });
  } else {
    // Round 27 #2 — send-email broadcast personnalisé per-recipient.
    // Filtré côté send : on respecte emailMarketing opt-out (CASL).
    // Le template admin-custom-message a un ORDER_ID placeholder vide
    // qui dégrade gracieusement (h1 "Message de Plio").
    const recipients = await prisma.user.findMany({
      where: { id: { in: targetIds }, emailMarketing: true, email: { not: '' } },
      select: { id: true, email: true, firstName: true },
    });

    // Format body en paragraphes <p> (basic, l'admin saisit en plaintext).
    const bodyHtml = body.body
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
      .join('');

    let sentCount = 0;
    for (const r of recipients) {
      try {
        await sendAdminCustomMessageEmail({
          to: r.email,
          replyTo: guard.user.email,
          vars: {
            ORDER_ID: '',
            ORDER_URL: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca'}/account`,
            SUBJECT: body.subject,
            PREVIEW: body.body.slice(0, 80),
            BODY_HTML: bodyHtml,
            SENDER_NAME: 'Plio',
            SENDER_EMAIL: guard.user.email,
          },
        });
        sentCount++;
      } catch {
        // queueEmail catches its own errors, mais on belt-and-suspenders
      }
    }
    result = { count: sentCount };
  }

  void recordAdminAudit({
    // Round 1 audit — kind dédié : set-role = élévation de privilège, à tracer
    // distinctement des autres actions bulk (opt-in/out, message).
    kind: body.action === 'set-role' ? 'ADMIN_USER_ROLE_CHANGE' : 'ADMIN_USER_BULK_ACTION',
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

/** Round 27 #2 — minimal HTML escape pour le body custom (admin saisit
 *  en plaintext, on previent XSS basique en cas de paste accidentel). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
