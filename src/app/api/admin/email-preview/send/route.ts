/**
 * POST /api/admin/email-preview/send
 *
 * Envoie un email test (rendu d'un template avec des vars admin-fournies)
 * à l'adresse de l'admin courant. Pour valider sur un vrai client mail
 * (Gmail, Outlook, iOS Mail) avant de shipper un changement de template
 * ou un broadcast.
 *
 * Auth : ADMIN only. Audit log via recordAdminAudit.
 *
 * Body : { template: EmailTemplate, vars: Record, subject?: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { sendEmail, type EmailTemplate } from '@/lib/emails/render';
import { ALL_TEMPLATES } from '@/lib/emails/sample-vars';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { logEmail } from '@/lib/logger';

const BodySchema = z.object({
  template: z.string().min(1).max(50),
  vars: z.record(z.string(), z.union([z.string(), z.number()])),
  subject: z.string().min(1).max(200).optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);

  if (!ALL_TEMPLATES.includes(body.template as EmailTemplate)) {
    return NextResponse.json(
      { error: `Template inconnu : ${body.template}` },
      { status: 400 },
    );
  }

  // Le subject que l'admin voit dans l'aperçu, préfixé pour distinguer un
  // test d'un vrai email customer dans sa propre boîte.
  const subject = body.subject ?? `[Test] ${body.template}`;
  const prefixedSubject = `[PREVIEW] ${subject}`;

  try {
    await sendEmail({
      to: guard.user.email,
      template: body.template as EmailTemplate,
      vars: body.vars,
      subject: prefixedSubject,
    });
  } catch (err) {
    logEmail.error(
      { err, template: body.template, adminId: guard.userId },
      'admin email preview send failed',
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Email send failed' },
      { status: 502 },
    );
  }

  await recordAdminAudit({
    kind: 'ADMIN_RESEND_EMAIL',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: guard.user.id,
    data: {
      action: 'EMAIL_PREVIEW_TEST',
      template: body.template,
      subject: prefixedSubject,
    },
  });

  return NextResponse.json({
    ok: true,
    sent: true,
    to: guard.user.email,
    template: body.template,
  });
});
