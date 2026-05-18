/**
 * POST /api/quote/request
 *
 * Demande de devis sur-mesure pour jobs hors catalogue : grande quantité,
 * papier spécifique, finish unusual, substrats rigides, kit packaging.
 *
 * Public, rate-limited via bucket 'signin' (strict — endpoint ouvert).
 * Soft dedup : 1 demande PENDING/QUOTED par email par 7 jours (sinon
 * le customer va spammer le même projet en boucle).
 *
 * Notification admin via email + Slack pour réagir vite — les leads
 * custom-quote sont les plus juteux (souvent gros volumes / récurrents).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import { logEmail as log } from '@/lib/logger';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

const BodySchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().max(150),
  phone: z.string().max(30).optional(),
  companyName: z.string().max(200).optional(),
  projectType: z.string().min(1).max(200),
  estimatedQuantity: z.string().max(100).optional(),
  deadline: z.string().max(100).optional(),
  budgetCents: z.number().int().nonnegative().optional(),
  description: z.string().min(20).max(5000),
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const POST = withErrorHandler(async (req: Request) => {
  const limit = await rateLimit('signin', clientIp(req));
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);
  const emailNormalized = body.email.toLowerCase().trim();

  // Soft dedup : 1 demande active par email par 7 jours
  const recent = await prisma.customQuoteRequest.findFirst({
    where: {
      email: emailNormalized,
      status: { in: ['PENDING', 'QUOTED'] },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    return NextResponse.json(
      {
        error: `On a déjà reçu une demande de ta part le ${recent.createdAt.toLocaleDateString('fr-CA')} qu'on est en train de regarder. Si c'est un projet différent, écris-nous à bonjour@plio.ca avec les détails.`,
        code: 'RECENT_REQUEST',
      },
      { status: 409 },
    );
  }

  const request = await prisma.customQuoteRequest.create({
    data: {
      email: emailNormalized,
      name: body.name.trim(),
      phone: body.phone?.trim() ?? null,
      companyName: body.companyName?.trim() ?? null,
      projectType: body.projectType.trim(),
      estimatedQuantity: body.estimatedQuantity?.trim() ?? null,
      deadline: body.deadline?.trim() ?? null,
      budgetCents: body.budgetCents ?? null,
      description: body.description.trim(),
      requestIp: clientIp(req) ?? null,
      requestUa: req.headers.get('user-agent') ?? null,
    },
  });

  // Notification admin (best-effort, ne fail pas la requête si email fail)
  if (ADMIN_EMAILS.length > 0) {
    const html = `
      <p><strong>${escapeHtml(body.name)}</strong>${body.companyName ? ` · ${escapeHtml(body.companyName)}` : ''} (${escapeHtml(body.email)})${body.phone ? ` · ${escapeHtml(body.phone)}` : ''}</p>
      <p><strong>Projet :</strong> ${escapeHtml(body.projectType)}</p>
      ${body.estimatedQuantity ? `<p><strong>Quantité estimée :</strong> ${escapeHtml(body.estimatedQuantity)}</p>` : ''}
      ${body.deadline ? `<p><strong>Deadline :</strong> ${escapeHtml(body.deadline)}</p>` : ''}
      ${body.budgetCents !== undefined ? `<p><strong>Budget :</strong> ${(body.budgetCents / 100).toFixed(2)} $ CAD</p>` : ''}
      <p><strong>Description :</strong></p>
      <p style="padding:12px; background:#f7f7f7; border-radius:6px;">${escapeHtml(body.description).replace(/\n/g, '<br>')}</p>
      <p style="margin-top:24px;"><a href="${APP_URL}/admin/quotes">Voir dans l&apos;admin →</a></p>
    `;
    const subject = `[Quote] ${body.name} demande devis · ${body.projectType.slice(0, 60)}`;
    for (const adminEmail of ADMIN_EMAILS) {
      try {
        await sendAdminCustomMessageEmail({
          to: adminEmail,
          replyTo: body.email,
          vars: {
            ORDER_ID: request.id.slice(-6).toUpperCase(),
            SUBJECT: subject,
            PREVIEW: `${body.name} demande un devis pour : ${body.projectType.slice(0, 80)}`,
            BODY_HTML: html,
            ORDER_URL: `${APP_URL}/admin/quotes`,
            SENDER_NAME: body.name,
            SENDER_EMAIL: body.email,
          },
        });
      } catch (err) {
        log.error({ err, adminEmail, requestId: request.id }, 'custom quote admin notification failed');
      }
    }
  }

  // Slack — lead chaud, on veut réagir vite
  void sendCriticalAlert({
    severity: 'info',
    title: `💰 Nouvelle demande de devis · ${body.name}${body.companyName ? ` (${body.companyName})` : ''}`,
    body: `Projet : ${body.projectType}${body.estimatedQuantity ? `\nQuantité : ${body.estimatedQuantity}` : ''}${body.deadline ? `\nDeadline : ${body.deadline}` : ''}${body.budgetCents !== undefined ? `\nBudget : ${(body.budgetCents / 100).toFixed(2)} $ CAD` : ''}\n\n${body.description.slice(0, 300)}${body.description.length > 300 ? '…' : ''}`,
    context: { email: body.email },
    actionUrl: `${APP_URL}/admin/quotes`,
    actionLabel: 'Voir dans /admin/quotes',
  });

  return NextResponse.json({ ok: true, id: request.id });
});
