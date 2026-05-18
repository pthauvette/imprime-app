/**
 * POST /api/reseller/apply
 *
 * Application au programme reseller. Public, rate-limited.
 * Dedup soft : 1 application par email (si déjà PENDING ou APPROVED,
 * on rejette avec 409). Si REJECTED, on accepte une nouvelle demande
 * (l'admin a peut-être changé d'avis ou l'applicant a évolué).
 *
 * Notification admin via email pour modération rapide.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { logEmail as log } from '@/lib/logger';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

const BodySchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(150),
  email: z.string().email().max(150),
  phone: z.string().max(30).optional(),
  website: z.string().url().max(300).optional(),
  estimatedMonthlyCents: z.number().int().nonnegative().optional(),
  currentSolution: z.string().max(300).optional(),
  projectTypes: z.string().max(300).optional(),
  message: z.string().max(3000).optional(),
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

  // Soft dedup : si une application PENDING ou APPROVED existe déjà
  // pour cet email, on rejette. Si REJECTED, on laisse passer.
  const existing = await prisma.resellerApplication.findFirst({
    where: {
      email: emailNormalized,
      status: { in: ['PENDING', 'APPROVED'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    const msg = existing.status === 'PENDING'
      ? `On a déjà reçu ta demande le ${existing.createdAt.toLocaleDateString('fr-CA')}, on la traite. Réponse sous 1-2 jours ouvrables.`
      : 'Ton compte est déjà actif comme reseller. Connecte-toi pour passer ta commande.';
    return NextResponse.json(
      { error: msg, code: existing.status === 'PENDING' ? 'PENDING' : 'ALREADY_APPROVED' },
      { status: 409 },
    );
  }

  const application = await prisma.resellerApplication.create({
    data: {
      companyName: body.companyName.trim(),
      contactName: body.contactName.trim(),
      email: emailNormalized,
      phone: body.phone?.trim() ?? null,
      website: body.website?.trim() ?? null,
      estimatedMonthlyCents: body.estimatedMonthlyCents ?? null,
      currentSolution: body.currentSolution?.trim() ?? null,
      projectTypes: body.projectTypes?.trim() ?? null,
      message: body.message?.trim() ?? null,
      requestIp: clientIp(req) ?? null,
      requestUa: req.headers.get('user-agent') ?? null,
    },
  });

  // Notification admin (best-effort)
  if (ADMIN_EMAILS.length > 0) {
    const html = `
      <p><strong>${escapeHtml(body.companyName)}</strong></p>
      <p>${escapeHtml(body.contactName)} · ${escapeHtml(body.email)}${body.phone ? ` · ${escapeHtml(body.phone)}` : ''}${body.website ? ` · <a href="${escapeHtml(body.website)}">${escapeHtml(body.website)}</a>` : ''}</p>
      ${body.estimatedMonthlyCents !== undefined ? `<p><strong>Volume mensuel estimé :</strong> ${(body.estimatedMonthlyCents / 100).toFixed(2)} $ CAD</p>` : ''}
      ${body.currentSolution ? `<p><strong>Solution actuelle :</strong> ${escapeHtml(body.currentSolution)}</p>` : ''}
      ${body.projectTypes ? `<p><strong>Types de projets :</strong> ${escapeHtml(body.projectTypes)}</p>` : ''}
      ${body.message ? `<p><strong>Message :</strong></p><p style="padding:12px; background:#f7f7f7; border-radius:6px;">${escapeHtml(body.message).replace(/\n/g, '<br>')}</p>` : ''}
      <p style="margin-top:24px;"><a href="${APP_URL}/admin/reseller-applications">Voir dans l&apos;admin →</a></p>
    `;
    const subject = `[Reseller] ${body.companyName} (${body.contactName}) postule`;
    for (const adminEmail of ADMIN_EMAILS) {
      try {
        await sendAdminCustomMessageEmail({
          to: adminEmail,
          replyTo: body.email,
          vars: {
            ORDER_ID: application.id.slice(-6).toUpperCase(),
            SUBJECT: subject,
            PREVIEW: `${body.contactName} (${body.companyName}) postule au programme reseller`,
            BODY_HTML: html,
            ORDER_URL: `${APP_URL}/admin/reseller-applications`,
            SENDER_NAME: body.contactName,
            SENDER_EMAIL: body.email,
          },
        });
      } catch (err) {
        log.error({ err, adminEmail, applicationId: application.id }, 'reseller application admin notification failed');
      }
    }
  }

  return NextResponse.json({ ok: true, id: application.id });
});
