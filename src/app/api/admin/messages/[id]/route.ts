/**
 * PATCH /api/admin/messages/[id]
 *
 * Actions admin sur un ContactMessage :
 *   - answered : status OPEN → ANSWERED + answeredAt = now
 *   - close    : status → CLOSED + closedAt = now
 *   - reopen   : status → OPEN (depuis ANSWERED/CLOSED)
 *   - note     : update adminNotes
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { logAdmin } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('answered') }),
  z.object({ action: z.literal('close') }),
  z.object({ action: z.literal('reopen') }),
  z.object({ action: z.literal('note'), adminNotes: z.string().max(2000) }),
  // Round 18 #4 — Reply : envoie un email au customer + mark ANSWERED + audit.
  z.object({
    action: z.literal('reply'),
    body: z.string().min(10).max(5000),
    subjectOverride: z.string().min(1).max(200).optional(),
  }),
]);

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const existing = await prisma.contactMessage.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
  }

  const now = new Date();
  let updated;
  if (body.action === 'answered') {
    updated = await prisma.contactMessage.update({
      where: { id },
      data: { status: 'ANSWERED', answeredAt: now },
    });
  } else if (body.action === 'close') {
    updated = await prisma.contactMessage.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: now },
    });
  } else if (body.action === 'reopen') {
    updated = await prisma.contactMessage.update({
      where: { id },
      data: { status: 'OPEN', closedAt: null, answeredAt: null },
    });
  } else if (body.action === 'note') {
    updated = await prisma.contactMessage.update({
      where: { id },
      data: { adminNotes: body.adminNotes },
    });
  } else {
    // Round 18 #4 — Reply : envoie un email au customer + mark ANSWERED.
    // sendAdminCustomMessageEmail va via la queue email (retry + open
    // tracking). Le subject reprend "Re: " + original par default sauf
    // override admin (cas où le message a un subject vague).
    const subject = body.subjectOverride?.trim() || `Re: ${existing.subject}`;
    const bodyHtml = body.body
      .split('\n\n')
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
      .join('');

    try {
      await sendAdminCustomMessageEmail({
        to: existing.email,
        replyTo: guard.user.email,
        vars: {
          ORDER_ID: id.slice(-6).toUpperCase(),
          SUBJECT: subject,
          PREVIEW: body.body.slice(0, 100),
          BODY_HTML: bodyHtml + `\n<p style="margin-top:24px; font-size:13px; color:#7A8780;">— Équipe Plio<br>Si tu as d'autres questions, réponds simplement à cet email.</p>`,
          ORDER_URL: `${APP_URL}/contact`,
          SENDER_NAME: guard.user.email.split('@')[0] || 'Plio',
          SENDER_EMAIL: 'bonjour@plio.ca',
        },
      });
    } catch (err) {
      logAdmin.error({ err, messageId: id, to: existing.email }, 'reply email send failed');
      return NextResponse.json(
        { error: "L'email n'a pas pu être envoyé. Le statut n'a pas été changé." },
        { status: 500 },
      );
    }

    updated = await prisma.contactMessage.update({
      where: { id },
      data: { status: 'ANSWERED', answeredAt: now },
    });
  }

  void recordAdminAudit({
    kind: 'ADMIN_TEMPLATE_EDIT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: existing.email,
    data: {
      action: `MESSAGE_${body.action.toUpperCase()}`,
      messageId: id,
      previousStatus: existing.status,
      newStatus: updated.status,
      ...(body.action === 'reply' && { replyBodyChars: body.body.length }),
    },
  });

  return NextResponse.json({ ok: true, message: updated });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
