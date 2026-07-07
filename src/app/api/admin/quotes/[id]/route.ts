/**
 * PATCH /api/admin/quotes/[id]
 *
 * Actions admin sur une demande de devis sur-mesure :
 *   - quoted  : status → QUOTED + quotedAt + adminResponse (le quote envoyé)
 *   - accept  : status → ACCEPTED + decidedAt (customer a confirmé)
 *   - reject  : status → REJECTED + decidedAt + adminNotes optional
 *   - archive : status → ARCHIVED (closed sans suite)
 *   - note    : update adminNotes uniquement (pas de changement de status)
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('quoted'), adminResponse: z.string().min(1).max(5000) }),
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('reject'), adminNotes: z.string().max(500).optional() }),
  z.object({ action: z.literal('archive') }),
  z.object({ action: z.literal('note'), adminNotes: z.string().max(2000) }),
]);

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const existing = await prisma.customQuoteRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  }

  const now = new Date();
  let updated;
  if (body.action === 'quoted') {
    // Round 21 #2 — envoie un email avec le quote au customer.
    // Atomic UX : si l'email send fail, on ne change pas le statut
    // (sinon le customer ne saurait jamais que son quote est prêt).
    const bodyHtml = body.adminResponse
      .split(/\n\n+/)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
      .join('');
    try {
      await sendAdminCustomMessageEmail({
        to: existing.email,
        replyTo: guard.user.email,
        vars: {
          ORDER_ID: id.slice(-6).toUpperCase(),
          SUBJECT: `Ton devis Plio pour ${existing.projectType}`,
          PREVIEW: body.adminResponse.slice(0, 120).replace(/\n/g, ' '),
          BODY_HTML: bodyHtml + `\n<p style="margin-top:24px; font-size:13px; color:#7A8780;">— Équipe Plio<br>Réponds simplement à cet email pour valider ou poser des questions.</p>`,
          ORDER_URL: `${APP_URL}/quote`,
          SENDER_NAME: guard.user.email.split('@')[0] || 'Plio',
          SENDER_EMAIL: 'bonjour@plio.ca',
        },
      });
    } catch (err) {
      logAdmin.error({ err, quoteId: id, to: existing.email }, 'quote email send failed');
      return NextResponse.json(
        { error: "L'email n'a pas pu être envoyé. Le statut reste PENDING — réessaie." },
        { status: 500 },
      );
    }
    updated = await prisma.customQuoteRequest.update({
      where: { id },
      data: { status: 'QUOTED', quotedAt: now, adminResponse: body.adminResponse },
    });
  } else if (body.action === 'accept') {
    updated = await prisma.customQuoteRequest.update({
      where: { id },
      data: { status: 'ACCEPTED', decidedAt: now },
    });
  } else if (body.action === 'reject') {
    updated = await prisma.customQuoteRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedAt: now,
        ...(body.adminNotes !== undefined && { adminNotes: body.adminNotes }),
      },
    });
  } else if (body.action === 'archive') {
    updated = await prisma.customQuoteRequest.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  } else {
    updated = await prisma.customQuoteRequest.update({
      where: { id },
      data: { adminNotes: body.adminNotes },
    });
  }

  await recordAdminAudit({
    kind: 'ADMIN_QUOTE_DECISION', // §8.6 — kind dédié (était ADMIN_TEMPLATE_EDIT)
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'QUOTE',
    targetId: id,
    data: {
      action: `QUOTE_${body.action.toUpperCase()}`,
      requestId: id,
      email: existing.email,
      projectType: existing.projectType,
      previousStatus: existing.status,
      newStatus: updated.status,
    },
  });

  return NextResponse.json({ ok: true, request: updated });
});
