/**
 * Helpers pour résoudre la liste de destinataires d'un broadcast email.
 *
 * CASL compliance (Canadian Anti-Spam) :
 *   - 'newsletter' : NewsletterSubscriber actifs (consentement EXPRESS via
 *     coche du form au moment de l'inscription — IP enregistrée comme preuve)
 *   - 'customers' : User avec au moins 1 commande payée dans les 24 derniers
 *     mois ET emailDeliveryNotifications = true. Le statut "existing business
 *     relationship" donne 24 mois de implied consent pour des emails liés au
 *     commerce.
 *   - 'all' : union newsletter + customers, dédupé par email lowercase
 *   - 'tier-{gold,silver,bronze}' : segment par loyalty tier (User.loyaltyTier
 *     recomputé mensuellement, cf. Round 12 #3) — opted-in + (pour bronze)
 *     fenêtre CASL respectée.
 *   - 'inactive-90d' : clients avec ≥1 commande dans 24m mais aucune dans
 *     les 90 derniers j (campagne de relance).
 *
 * Retourne toujours emails normalisés (lowercase trim).
 */

import { prisma } from '@/lib/db';

export type BroadcastSegment =
  | 'newsletter'
  | 'customers'
  | 'all'
  | 'tier-gold'
  | 'tier-silver'
  | 'tier-bronze'
  | 'inactive-90d';

export const ALL_SEGMENTS: BroadcastSegment[] = [
  'newsletter',
  'customers',
  'all',
  'tier-gold',
  'tier-silver',
  'tier-bronze',
  'inactive-90d',
];

const IMPLIED_CONSENT_DAYS = 24 * 30; // 24 mois CASL
const PAID_STATUSES = ['PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] as const;

/**
 * Labels human-readable utilisés dans le composer + audit log.
 */
export const SEGMENT_LABELS: Record<BroadcastSegment, string> = {
  newsletter: 'Newsletter (opt-in CASL express)',
  customers: 'Clients payants (24 derniers mois, opted-in)',
  all: 'Tous (newsletter + clients, dédupé)',
  'tier-gold': 'Tier OR (≥ 2000 $ / 12 mois, opted-in)',
  'tier-silver': 'Tier ARGENT (≥ 500 $ / 12 mois, opted-in)',
  'tier-bronze': 'Tier BRONZE actif (24 mois CASL, opted-in)',
  'inactive-90d': 'Inactifs > 90 j (campagne de relance, opted-in)',
};

export async function resolveRecipients(segment: BroadcastSegment): Promise<string[]> {
  const cutoff = new Date(Date.now() - IMPLIED_CONSENT_DAYS * 24 * 3600 * 1000);

  if (segment === 'newsletter') {
    const subs = await prisma.newsletterSubscriber.findMany({
      where: { status: 'ACTIVE' },
      select: { email: true },
    });
    return dedupe(subs.map((s) => s.email));
  }

  if (segment === 'customers') {
    // Users opted-in qui ont au moins une commande payée dans les 24 derniers mois.
    const users = await prisma.user.findMany({
      where: {
        emailDeliveryNotifications: true,
        orders: {
          some: {
            status: { in: [...PAID_STATUSES] },
            createdAt: { gte: cutoff },
          },
        },
      },
      select: { email: true },
    });
    return dedupe(users.map((u) => u.email));
  }

  // Loyalty-tier segments
  if (segment === 'tier-gold' || segment === 'tier-silver' || segment === 'tier-bronze') {
    const tier = segment === 'tier-gold' ? 'GOLD'
      : segment === 'tier-silver' ? 'SILVER'
      : 'BRONZE';
    const users = await prisma.user.findMany({
      where: {
        emailDeliveryNotifications: true,
        loyaltyTier: tier,
        // BRONZE inclut tous les nouveaux users qui n'ont jamais commandé —
        // pour CASL on garde uniquement ceux avec ≥ 1 order dans la fenêtre.
        ...(tier === 'BRONZE' ? {
          orders: { some: { status: { in: [...PAID_STATUSES] }, createdAt: { gte: cutoff } } },
        } : {}),
      },
      select: { email: true },
    });
    return dedupe(users.map((u) => u.email));
  }

  if (segment === 'inactive-90d') {
    // Clients avec une order dans 24m, mais aucune dans 90j (relance).
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const users = await prisma.user.findMany({
      where: {
        emailDeliveryNotifications: true,
        orders: {
          some: {
            status: { in: [...PAID_STATUSES] },
            createdAt: { gte: cutoff },
          },
          none: {
            status: { in: [...PAID_STATUSES] },
            createdAt: { gte: ninetyDaysAgo },
          },
        },
      },
      select: { email: true },
    });
    return dedupe(users.map((u) => u.email));
  }

  // 'all' = union newsletter + customers
  const [newsletterEmails, customerEmails] = await Promise.all([
    resolveRecipients('newsletter'),
    resolveRecipients('customers'),
  ]);
  return dedupe([...newsletterEmails, ...customerEmails]);
}

export async function previewRecipientCount(segment: BroadcastSegment): Promise<number> {
  if (segment === 'all') {
    const emails = await resolveRecipients('all');
    return emails.length;
  }
  if (segment === 'newsletter') {
    return prisma.newsletterSubscriber.count({ where: { status: 'ACTIVE' } });
  }
  // Tous les autres : résoudre pour avoir le count post-opt-out + post-dedup exact.
  const emails = await resolveRecipients(segment);
  return emails.length;
}

function dedupe(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw.trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}
