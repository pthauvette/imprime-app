/**
 * POST /api/admin/users/[id]/delete-pipeda
 *
 * Traite une demande de suppression PIPEDA d'un user. On NE DELETE PAS
 * le User row hard — on l'ANONYMISE :
 *   - email → "deleted-${id}@anonymized.plio.local"
 *   - firstName/lastName/name/phone → NULL
 *   - referralCode → NULL (release du code pour réutilisation)
 *   - referralCreditCents → 0
 *   - emailMarketing/Reengagement/Delivery → false
 *
 * Pourquoi pas hard delete : les Orders ont une FK vers User SANS Cascade
 * (volontaire — LIR art. 230 obligation de conservation des reçus 6 ans).
 *
 * Cascade tables qui SONT delete-many'd manuellement :
 *   Account, Session, Address, Draft, DesignDraft, SavedConfig
 *
 * Workflow :
 *   1. Garde admin
 *   2. Valide qu'une DeleteAccountRequest PENDING/APPROVED existe
 *   3. Body { confirm: "SUPPRIMER" } — double-tap UX
 *   4. Transaction : delete relations + anonymize User + mark request PROCESSED
 *   5. recordAdminAudit kind=ADMIN_DELETE_USER_PIPEDA
 *   6. Email confirmation au customer (emailSnapshot, avant anonymize)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { logAdmin } from '@/lib/logger';

const BodySchema = z.object({
  /** Double-confirm : doit valoir exactement "SUPPRIMER". */
  confirm: z.literal('SUPPRIMER'),
  /** Notes admin sur le traitement (optionnel). */
  adminNotes: z.string().max(1000).optional(),
});

export const POST = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id: userId } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  // 1. Charge le user + sa demande active
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      deleteRequests: {
        where: { status: { in: ['PENDING', 'APPROVED'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User introuvable' }, { status: 404 });
  }
  if (user.deleteRequests.length === 0) {
    return NextResponse.json(
      { error: 'Aucune demande de suppression PIPEDA en cours pour ce user.', code: 'NO_REQUEST' },
      { status: 400 },
    );
  }
  const request = user.deleteRequests[0]!;
  const emailSnapshot = user.email;

  // 2. Transaction : delete relations + anonymize User + mark request PROCESSED
  // Note : on garde Orders (LIR art. 230 retention 6 ans), ReferralReward
  // (audit), AdminAuditEvent, ContactMessage, EmailDelivery, NewsletterSubscriber.
  const now = new Date();
  const anonymizedEmail = `deleted-${userId.slice(-8)}@anonymized.plio.local`;

  await prisma.$transaction([
    // Cascade-able auth tables (on ne peut pas hard-delete User à cause des
    // Orders FK, mais on peut delete ses sessions/accounts/etc. directement).
    prisma.account.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.address.deleteMany({ where: { userId } }),
    prisma.draft.deleteMany({ where: { userId } }),
    prisma.designDraft.deleteMany({ where: { userId } }),
    prisma.savedConfig.deleteMany({ where: { userId } }),
    // Anonymize User row
    prisma.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmail,
        emailVerified: null,
        name: null,
        firstName: null,
        lastName: null,
        phone: null,
        image: null,
        referralCode: null,
        referralCreditCents: 0,
        emailDeliveryNotifications: false,
        emailMarketing: false,
        emailReengagement: false,
        adminNotes: `PIPEDA DELETE ${now.toISOString().slice(0, 10)} by ${guard.user.email}`,
        adminNotesUpdatedAt: now,
        adminNotesUpdatedBy: guard.user.email,
      },
    }),
    // Mark request as PROCESSED
    prisma.deleteAccountRequest.update({
      where: { id: request.id },
      data: {
        status: 'PROCESSED',
        processedAt: now,
        decidedAt: now,
        adminNotes: body.adminNotes ?? null,
      },
    }),
  ]);

  // 3. Audit log
  void recordAdminAudit({
    kind: 'ADMIN_DELETE_USER_PIPEDA',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: userId,
    data: {
      emailSnapshot,
      requestId: request.id,
      anonymizedEmail,
      adminNotes: body.adminNotes ?? null,
    },
  });

  // 4. Email confirmation au customer (avant que l'email soit anonymisé)
  try {
    await sendAdminCustomMessageEmail({
      to: emailSnapshot,
      replyTo: guard.user.email,
      vars: {
        ORDER_ID: request.id.slice(-6).toUpperCase(),
        SUBJECT: 'Confirmation : ton compte Plio a été supprimé',
        PREVIEW: 'Ta demande de suppression PIPEDA a été traitée.',
        BODY_HTML: `
          <p>Salut,</p>
          <p>Ta demande de suppression de compte (PIPEDA) a été traitée en date du
          <strong>${now.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>
          <p>Ton compte est maintenant anonymisé :</p>
          <ul>
            <li>Adresse email, nom, téléphone, adresses → supprimés</li>
            <li>Code de parrainage → libéré</li>
            <li>Sessions actives → terminées</li>
            <li>Brouillons + designs → supprimés</li>
          </ul>
          <p>On conserve uniquement les <strong>factures de tes commandes passées</strong>
          (anonymisées sous ID interne) pour la durée prescrite par la loi sur l&apos;impôt
          fédérale (6 ans, LIR art. 230).</p>
          <p>Merci d&apos;avoir essayé Plio. Si tu reviens, ce sera comme un nouveau client.</p>
          <p style="margin-top:24px;">— L&apos;équipe Plio</p>
        `,
        ORDER_URL: 'https://plio.ca',
        SENDER_NAME: 'Plio Privacy',
        SENDER_EMAIL: 'privacy@plio.ca',
      },
    });
  } catch (err) {
    logAdmin.warn({ err, userId, requestId: request.id }, 'PIPEDA confirmation email failed (non-fatal)');
  }

  return NextResponse.json({
    ok: true,
    userId,
    requestId: request.id,
    anonymizedEmail,
  });
});
