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
import { deleteObjectsByUrl } from '@/lib/storage/s3';
import { scrubSinalitePayloadPII } from '@/lib/account/scrub-sinalite-payload';

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
  //
  // Round 39 #1 — Extension PIPEDA : avant ce fix, on anonymisait juste le
  // User row + delete les sessions/drafts. Mais Order.shipName/shipLine*/shipPhone,
  // ContactMessage.email/name/message, AbandonedCart.email,
  // NewsletterSubscriber.email RESTAIENT en clair → CAI Québec audit failure
  // direct.
  //
  // Maintenant : on anonymise/delete les tables PII supplémentaires. Le
  // fait que les Orders SOIENT KEPT (LIR retention 6 ans) ne dispense pas
  // de l'obligation PIPEDA de pseudonymiser les PII customer-identifiable.
  // On conserve les amounts/dates/province (utiles pour fiscal/CRA report)
  // mais on wipe nom/adresse/téléphone.
  // (2026-08 — la fonctionnalité échantillons/SampleRequest, qui figurait
  // aussi ici, a été retirée entièrement du produit.)
  const now = new Date();
  const anonymizedEmail = `deleted-${userId.slice(-8)}@anonymized.plio.local`;
  const ANONYMIZED_TEXT = '[PIPEDA-DELETED]';

  // Audit v3 H1 — scrub des PII dans Order.sinalitePayload (snapshot JSON conservé
  // 6 ans LIR). Les colonnes Order.ship* sont anonymisées plus bas, mais ce JSON
  // gardait nom/courriel/adresse/téléphone (Ship*/Bill*) EN CLAIR. On le ré-écrit
  // par order (valeur dépendante du contenu → pas un updateMany). Province (State)
  // conservée comme Order.shipProvince.
  const ordersToScrub = await prisma.order.findMany({
    where: { userId },
    select: { id: true, sinalitePayload: true },
  });
  const scrubSentinels = { text: ANONYMIZED_TEXT, email: anonymizedEmail, postal: 'A0A 0A0', phone: '+10000000000' };
  const scrubOps = ordersToScrub.map((o) =>
    prisma.order.update({
      where: { id: o.id },
      data: { sinalitePayload: scrubSinalitePayloadPII(o.sinalitePayload, scrubSentinels) },
    }),
  );

  // Audit pré-lancement P1-1 — collecter les URLs S3 AVANT la transaction : elle
  // supprime les rows Draft/DesignDraft, donc les URLs seraient perdues après.
  // Le courriel de confirmation affirme « Brouillons + designs → supprimés » ;
  // sans cette purge, c'était FAUX — les PDF restaient public-read à une URL
  // toujours valide (Loi 25 art. 28.1). Aucun `DeleteObject` n'existait dans
  // tout le dépôt.
  const [draftsToPurge, designDraftsToPurge] = await Promise.all([
    prisma.draft.findMany({ where: { userId }, select: { files: true } }),
    prisma.designDraft.findMany({ where: { userId }, select: { finalPdfUrl: true } }),
  ]);
  const s3UrlsToPurge: (string | null)[] = [
    ...designDraftsToPurge.map((d) => d.finalPdfUrl),
    ...draftsToPurge.flatMap((d) => {
      // `files` = JSON `{ type, url }[]` — défensif contre un JSON corrompu.
      try {
        const parsed = JSON.parse(d.files) as unknown;
        return Array.isArray(parsed)
          ? parsed.map((f) => (f && typeof f === 'object' && 'url' in f ? String((f as { url: unknown }).url) : null))
          : [];
      } catch {
        return [];
      }
    }),
  ];

  await prisma.$transaction([
    ...scrubOps,
    // Cascade-able auth tables
    prisma.account.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.address.deleteMany({ where: { userId } }),
    prisma.draft.deleteMany({ where: { userId } }),
    prisma.designDraft.deleteMany({ where: { userId } }),
    prisma.savedConfig.deleteMany({ where: { userId } }),
    // Clés API : la suppression est une ANONYMISATION par allowlist (le User
    // survit), PAS un hard-delete → onDelete:Cascade ne se déclenche jamais. On
    // DOIT purger les clés explicitement, sinon un credential live survit à un
    // compte « supprimé » (faille sécu + non-conformité Loi 25). Toute nouvelle
    // table possédée par User doit être ajoutée ici.
    prisma.apiKey.deleteMany({ where: { userId } }),
    prisma.mcpOrderIntent.deleteMany({ where: { userId } }),

    // Round 39 #1 — anonymize Order.ship* (kept rows pour LIR 6 ans
    // mais shipping address customer-identifiable doit être wipée).
    // shipProvince conservé pour CRA tax report. shippingMethod aussi
    // (analytics non-PII).
    prisma.order.updateMany({
      where: { userId },
      data: {
        shipName: ANONYMIZED_TEXT,
        shipLine1: ANONYMIZED_TEXT,
        shipLine2: null,
        shipCity: ANONYMIZED_TEXT,
        shipPostalCode: 'A0A 0A0', // format valide mais sentinel
        shipPhone: '+10000000000',
      },
    }),

    // Round 39 #1 — ContactMessage : anonymize par user.email match.
    // Garde le message/subject pour pattern detection futur (admin support
    // analytics) mais wipe email + nom.
    prisma.contactMessage.updateMany({
      where: { email: emailSnapshot.toLowerCase() },
      data: {
        email: anonymizedEmail,
        name: ANONYMIZED_TEXT,
      },
    }),

    // Round 39 #1 — AbandonedCart : DELETE direct (short-lived data,
    // pas d'audit retention requise). Email matched.
    prisma.abandonedCart.deleteMany({
      where: { email: emailSnapshot.toLowerCase() },
    }),

    // Round 39 #1 — NewsletterSubscriber : DELETE direct + consentIp wipe.
    // (Aurait pu être anonymize mais newsletter n'a aucune retention obligatoire.)
    prisma.newsletterSubscriber.deleteMany({
      where: { email: emailSnapshot.toLowerCase() },
    }),

    // Audit-vérif Légal #3 — EmailDelivery : DELETE direct. `to` (courriel) +
    // `varsJson` (nom + adresse de livraison rendus dans les confirmations) sont
    // des PII customer-identifiable. Ce sont des logs de livraison SANS rétention
    // fiscale → suppression. Sans ça, le courriel + nom + adresse du client
    // survivaient EN CLAIR après une suppression PIPEDA, en contradiction directe
    // avec le courriel de confirmation envoyé au client (« supprimés »).
    prisma.emailDelivery.deleteMany({
      where: { to: emailSnapshot.toLowerCase() },
    }),

    // Audit-vérif Légal #3 — CustomQuoteRequest : anonymise les PII du demandeur
    // (courriel / nom / téléphone / company / IP / UA). Garde le contenu projet
    // (type, description, budget, statut) — non-identifiant — pour les analytics.
    prisma.customQuoteRequest.updateMany({
      where: { email: emailSnapshot.toLowerCase() },
      data: {
        email: anonymizedEmail,
        name: ANONYMIZED_TEXT,
        phone: null,
        companyName: null,
        requestIp: null,
        requestUa: null,
      },
    }),

    // Revue privacy Loi 25 — ResellerApplication : anonymise les PII du demandeur
    // (courriel / nom contact / entreprise / tél / site / IP / UA + message libre,
    // souvent identifiant). Garde les champs analytics non-identifiants (statut,
    // estimatedMonthlyCents, currentSolution, projectTypes). Matched par email
    // (pas de FK à User). Sans ça, une demande reseller survivait EN CLAIR à une
    // suppression PIPEDA — trou sur le droit à l'effacement (art. 28.1).
    prisma.resellerApplication.updateMany({
      where: { email: emailSnapshot.toLowerCase() },
      data: {
        email: anonymizedEmail,
        contactName: ANONYMIZED_TEXT,
        companyName: ANONYMIZED_TEXT,
        phone: null,
        website: null,
        message: null,
        requestIp: null,
        requestUa: null,
      },
    }),

    // Anonymize User row (inchangé)
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

  // 2b. Purge S3 — HORS transaction (un appel réseau n'a rien à y faire) et
  // best-effort : un échec S3 ne doit pas annuler l'anonymisation DB, qui est
  // prioritaire et déjà commitée. Le résultat est journalisé ET versé à l'audit
  // admin, pour qu'un échec soit constatable et rejouable.
  const s3Purge = await deleteObjectsByUrl(s3UrlsToPurge);
  if (s3Purge.errors.length > 0) {
    logAdmin.error(
      { userId, ...s3Purge },
      'PIPEDA : purge S3 partielle — des fichiers client survivent, à retirer manuellement',
    );
  } else {
    logAdmin.info({ userId, ...s3Purge }, 'PIPEDA : purge S3 effectuée');
  }

  // 3. Audit log
  await recordAdminAudit({
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
      s3Deleted: s3Purge.deleted,
      s3Skipped: s3Purge.skipped,
      s3Errors: s3Purge.errors.length,
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
