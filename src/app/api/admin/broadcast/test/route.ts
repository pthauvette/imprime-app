/**
 * POST /api/admin/broadcast/test
 *
 * Envoie le broadcast à l'email de l'admin uniquement — pour valider le
 * rendu final dans son client mail (Gmail/Outlook/Apple Mail) avant le
 * vrai blast. Pas de DB row (pas un "vrai" broadcast), juste un queueEmail
 * direct avec label deterministic anti-spam.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { newsletterUnsubscribeToken } from '@/lib/newsletter/token';

const BodySchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(20).max(10000),
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';
  const adminEmail = guard.user.email;
  const unsubParams = new URLSearchParams({
    email: adminEmail,
    token: newsletterUnsubscribeToken(adminEmail),
  });

  const result = await sendAdminCustomMessageEmail({
    to: adminEmail,
    replyTo: adminEmail,
    vars: {
      ORDER_ID: 'TEST',
      SUBJECT: `[TEST] ${body.subject}`,
      PREVIEW: body.body.slice(0, 120).replace(/\n/g, ' '),
      BODY_HTML: textToHtml(body.body),
      ORDER_URL: `${baseUrl}/account`,
      SENDER_NAME: 'Équipe Plio (TEST)',
      SENDER_EMAIL: adminEmail,
      UNSUBSCRIBE_URL: `${baseUrl}/newsletter/unsubscribe?${unsubParams.toString()}`,
    },
  });

  void recordAdminAudit({
    kind: 'ADMIN_RESEND_EMAIL',
    adminId: guard.userId,
    adminEmail,
    targetType: 'USER',
    targetId: guard.userId,
    data: {
      template: 'admin-custom-message',
      action: 'BROADCAST_TEST',
      subject: body.subject,
      bodyLength: body.body.length,
      sent: result.sent,
      deliveryId: result.id,
    },
  });

  return NextResponse.json({
    ok: true,
    sentTo: adminEmail,
    queued: result.sent,
    deliveryId: result.id,
  });
});
