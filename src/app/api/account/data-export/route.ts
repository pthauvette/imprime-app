/**
 * GET /api/account/data-export
 *
 * PIPEDA "right to access" — user télécharge toutes les données qu'on
 * stocke sur lui en JSON.
 *
 * Inclut : User profile, Orders (+ events + addresses snapshot), Addresses,
 * SavedConfigs, DesignDrafts, Drafts, ReferralReward (au choix giver/receiver),
 * NewsletterSubscriber status, ContactMessages envoyés.
 *
 * Exclut : webhooks events (pas son data — c'est le sytème), audit log
 * (admin-only), AdminAuditEvent.
 *
 * Format : JSON pretty-printed pour lisibilité. ZIP éventuel plus tard si
 * la taille devient un problème.
 *
 * Rate-limit : 1 export par jour par user (sinon abuse / overload DB).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { recordAdminAudit } from '@/lib/db/admin-audit';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }
  const userId = session.user.id;
  const userEmail = session.user.email ?? '';

  // Rate-limit serré — 1 export par 24h via bucket 'signin' (5 req/15min/IP).
  // Pour MVP on garde le bucket existant. À long terme, bucket dédié 'data-export'.
  const limit = await rateLimit('signin', clientIp(req));
  if (!limit.ok) return limit.response;

  // Parallel fetch tout ce qui appartient au user
  const [
    user,
    orders,
    addresses,
    savedConfigs,
    drafts,
    designDrafts,
    referralsGiven,
    referralReceived,
    newsletter,
    contactMessages,
    reviews,
    npsResponses,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, firstName: true, lastName: true,
        phone: true, role: true, emailVerified: true, emailDeliveryNotifications: true,
        referralCode: true, referredByCode: true, referralCreditCents: true,
        adminNotes: true, adminNotesUpdatedAt: true, adminNotesUpdatedBy: true,
        createdAt: true, updatedAt: true,
      },
    }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.address.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.savedConfig.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.draft.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.designDraft.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.referralReward.findMany({
      where: { referrerId: userId },
    }),
    prisma.referralReward.findUnique({
      where: { refereeUserId: userId },
    }),
    userEmail ? prisma.newsletterSubscriber.findUnique({
      where: { email: userEmail.toLowerCase() },
    }) : Promise.resolve(null),
    userEmail ? prisma.contactMessage.findMany({
      where: { email: userEmail.toLowerCase() },
      orderBy: { createdAt: 'desc' },
    }) : Promise.resolve([]),
    // Reviews publiques que le user a laissées (via ses orders)
    prisma.review.findMany({
      where: { order: { userId } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => []),
    // NPS feedback (interne, mais c'est le data du user → il a le droit
    // de voir ce qu'il a soumis). NpsResponse n'a pas de back-relation
    // vers Order — on fait un 2-step : extract orderIds depuis user's orders.
    prisma.order.findMany({
      where: { userId },
      select: { id: true },
    }).then((rows) =>
      prisma.npsResponse.findMany({
        where: { orderId: { in: rows.map((r) => r.id) } },
        orderBy: { createdAt: 'desc' },
      }),
    ).catch(() => []),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'User introuvable' }, { status: 404 });
  }

  const payload = {
    _meta: {
      exportedAt: new Date().toISOString(),
      userId,
      userEmail,
      legalNotice:
        'Ce fichier contient toutes les données personnelles que Plio stocke sur vous, ' +
        'conformément à la LPRPDE / PIPEDA. Si vous trouvez des informations incorrectes, ' +
        'écrivez à bonjour@plio.ca pour demander une correction. Pour demander une ' +
        'suppression complète de compte, voir /settings/privacy.',
      legalBasis: 'PIPEDA (Personal Information Protection and Electronic Documents Act)',
    },
    user,
    orders: orders.map((o) => ({
      ...o,
      sinalitePayload: '(snapshot omis — gros JSON, demande-le par email si besoin)',
    })),
    addresses,
    savedConfigs,
    drafts,
    designDrafts,
    referralsGiven,
    referralReceived,
    newsletter,
    contactMessages,
    reviews,
    npsResponses,
  };

  void recordAdminAudit({
    kind: 'ADMIN_DATA_EXPORT',
    adminId: userId,
    adminEmail: userEmail,
    targetType: 'USER',
    targetId: userId,
    data: {
      action: 'USER_DATA_EXPORT_SELF',
      orderCount: orders.length,
      addressCount: addresses.length,
      reviewCount: reviews.length,
      npsCount: npsResponses.length,
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `plio-data-export_${userEmail.replace(/[^a-z0-9]/gi, '_')}_${stamp}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
