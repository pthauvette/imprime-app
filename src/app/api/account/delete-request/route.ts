/**
 * POST /api/account/delete-request
 *
 * Customer demande la suppression de son compte (PIPEDA art. 4.5 Retention).
 * On crée une DeleteAccountRequest PENDING + on alerte admin via Slack +
 * email. Pas de hard delete immédiat — admin doit valider.
 *
 * Rate-limit : 1 demande max par user à la fois (UNIQUE constraint via
 * findFirst + 409 si existing PENDING).
 *
 * Auth requise (le user doit prouver qu'il a accès au compte avant de
 * demander sa suppression).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { logEmail as log } from '@/lib/logger';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

const BodySchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }
  const userId = session.user.id;
  const userEmail = session.user.email;

  const body = await parseBody(req, BodySchema);

  // Anti-duplicate : si PENDING déjà existe → 409 + message friendly
  const existing = await prisma.deleteAccountRequest.findFirst({
    where: { userId, status: { in: ['PENDING', 'APPROVED'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: `Tu as déjà une demande de suppression en cours (envoyée le ${existing.createdAt.toLocaleDateString('fr-CA')}). On revient vers toi sous 1-2 j ouvrables.`,
        code: 'EXISTING_PENDING',
      },
      { status: 409 },
    );
  }

  const request = await prisma.deleteAccountRequest.create({
    data: {
      userId,
      emailSnapshot: userEmail,
      reason: body.reason?.trim() ?? null,
    },
  });

  // Notif admin email — best-effort
  if (ADMIN_EMAILS.length > 0) {
    const html = `
      <p><strong>${userEmail}</strong> a demandé la suppression de son compte.</p>
      ${body.reason ? `<p><strong>Raison :</strong></p><p style="padding:12px; background:#f7f7f7; border-radius:6px;">${body.reason.replace(/\n/g, '<br>')}</p>` : '<p><em>Aucune raison fournie.</em></p>'}
      <p>Vérifier dans <a href="${APP_URL}/admin/users/${userId}">l&apos;admin user detail</a>. Avant approval, check :</p>
      <ul>
        <li>Commandes en cours (PENDING/IN_PRODUCTION)</li>
        <li>Crédit de parrainage non utilisé</li>
        <li>Statut reseller actif</li>
      </ul>
      <p style="margin-top:24px;"><a href="${APP_URL}/admin/users/${userId}">Voir l&apos;utilisateur →</a></p>
    `;
    for (const adminEmail of ADMIN_EMAILS) {
      try {
        await sendAdminCustomMessageEmail({
          to: adminEmail,
          replyTo: userEmail,
          vars: {
            ORDER_ID: request.id.slice(-6).toUpperCase(),
            SUBJECT: `[PIPEDA] Demande suppression compte · ${userEmail}`,
            PREVIEW: `${userEmail} a demandé la suppression de son compte Plio.`,
            BODY_HTML: html,
            ORDER_URL: `${APP_URL}/admin/users/${userId}`,
            SENDER_NAME: 'Plio Privacy',
            SENDER_EMAIL: 'privacy@plio.ca',
          },
        });
      } catch (err) {
        log.error({ err, adminEmail, requestId: request.id }, 'delete account request admin notif failed');
      }
    }
  }

  // Slack notification critical-level — PIPEDA compliance, on doit traiter sous 30j max
  void sendCriticalAlert({
    severity: 'warning',
    title: `🗑 Demande suppression compte (PIPEDA) · ${userEmail}`,
    body: `Un user a demandé la suppression de son compte. PIPEDA donne 30 j max pour traiter. Check commandes en cours, crédit parrainage, statut reseller avant d'approuver.${body.reason ? `\n\nRaison : ${body.reason.slice(0, 200)}` : ''}`,
    context: { userId, email: userEmail, requestId: request.id },
    actionUrl: `${APP_URL}/admin/users/${userId}`,
    actionLabel: 'Voir le user',
  });

  return NextResponse.json({ ok: true, requestId: request.id });
});
