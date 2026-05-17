/**
 * POST /api/contact
 *
 * Endpoint public pour le formulaire /contact. Envoie le message à
 * chaque adresse dans ADMIN_EMAILS via SES.
 *
 * Rate-limited via bucket 'signin' (le plus strict, 5 req/15min/IP) —
 * pour éviter d'être utilisé comme amplification spam.
 *
 * Reply-To set à l'email du sender → admin peut répondre direct depuis
 * Gmail sans avoir à copy-coller l'adresse.
 *
 * Pas d'auth requise — public. Mais on log toujours dans AdminAuditEvent
 * pour traçabilité + détection abus.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { log } from '@/lib/logger';

const BodySchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().max(150),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

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
  // Rate-limit serré — endpoint public, vulnérable au spam
  const limit = await rateLimit('signin', clientIp(req));
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);

  if (ADMIN_EMAILS.length === 0) {
    log.error('contact form submitted but ADMIN_EMAILS not configured');
    return NextResponse.json(
      { error: 'Le service de contact est temporairement indisponible. Écris directement à bonjour@plio.ca.' },
      { status: 503 },
    );
  }

  // Body composé : meta (de qui) + message original. SUBJECT garde [Contact]
  // prefix pour facile filter dans Gmail.
  const adminBody =
    `Nouveau message via /contact :\n\n` +
    `De : ${body.name} <${body.email}>\n` +
    `Sujet : ${body.subject}\n\n` +
    `─────────\n\n` +
    `${body.message}\n\n` +
    `─────────\n` +
    `Tu peux répondre direct à cet email — le Reply-To est ${body.email}.`;

  // Envoie à tous les ADMIN_EMAILS en parallèle
  const sends = await Promise.all(
    ADMIN_EMAILS.map(async (to) => {
      const r = await sendAdminCustomMessageEmail({
        to,
        replyTo: body.email,
        vars: {
          ORDER_ID: '—',
          SUBJECT: `[Contact] ${body.subject} · ${body.name}`,
          PREVIEW: `${body.name} · ${body.subject} · ${body.message.slice(0, 80)}`,
          BODY_HTML: textToHtml(adminBody),
          ORDER_URL: `${APP_URL}/admin`,
          SENDER_NAME: body.name,
          SENDER_EMAIL: body.email,
        },
      });
      return { to, sent: r !== null };
    }),
  );

  // Audit log pour traçabilité + détection abus
  void recordAdminAudit({
    kind: 'ADMIN_RESEND_EMAIL', // reuse — generic email kind
    adminId: 'system',
    adminEmail: 'system@plio.ca',
    targetType: 'USER',
    targetId: body.email.toLowerCase(),
    data: {
      action: 'CONTACT_FORM_SUBMISSION',
      name: body.name,
      subject: body.subject,
      messageLength: body.message.length,
      ip: clientIp(req),
    },
  });

  const anySent = sends.some((s) => s.sent);
  if (!anySent) {
    return NextResponse.json(
      { error: 'L\'envoi a échoué. Réessaye dans quelques minutes ou écris à bonjour@plio.ca.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
});
