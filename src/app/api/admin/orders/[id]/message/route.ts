/**
 * POST /api/admin/orders/[id]/message
 *
 * Envoie un message custom du admin au customer associé à la commande.
 * Body : { subject: string, body: string }
 *
 * Le body est du texte brut — on l'escape côté serveur + split en
 * paragraphes <p> pour rendre dans le template HTML. Comme ça, un admin
 * distrait qui paste du HTML brut ne casse pas l'email + on évite XSS.
 *
 * Le reply-to est l'email de l'admin envoyeur — le customer répond directe.
 * Audit log : ADMIN_RESEND_EMAIL avec subject + length du body pour trace.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

const BodySchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Transform plain text en HTML safe : escape + split paragraphes sur \n\n. */
function textToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((para) => {
      // Convertit single \n en <br>, escape, wrap en <p>
      const safe = escapeHtml(para.trim())
        .replace(/\n/g, '<br>');
      return `<p style="margin:0 0 14px;">${safe}</p>`;
    })
    .join('\n');
}

export const POST = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  }

  const displayOrderId = order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase();
  const adminName = guard.user.name ?? guard.user.email.split('@')[0];

  const result = await sendAdminCustomMessageEmail({
    to: order.user.email,
    replyTo: guard.user.email,
    vars: {
      ORDER_ID: displayOrderId,
      SUBJECT: body.subject,
      PREVIEW: body.body.slice(0, 120),
      BODY_HTML: textToHtml(body.body),
      ORDER_URL: `${APP_URL}/orders/${order.id}`,
      SENDER_NAME: adminName,
      SENDER_EMAIL: guard.user.email,
    },
  });

  void recordAdminAudit({
    kind: 'ADMIN_RESEND_EMAIL',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    targetId: id,
    data: {
      action: 'CUSTOM_MESSAGE_SENT',
      to: order.user.email,
      subject: body.subject,
      bodyLength: body.body.length,
    },
  });

  return NextResponse.json({
    ok: true,
    sent: result !== null,
    to: order.user.email,
  });
});
