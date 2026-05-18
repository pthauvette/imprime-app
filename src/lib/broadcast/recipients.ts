/**
 * Helpers pour résoudre la liste de destinataires d'un broadcast email.
 *
 * CASL compliance (Canadian Anti-Spam) :
 *   - 'newsletter' : NewsletterSubscriber actifs (consentement EXPRESS via
 *     coche du form au moment de l'inscription — IP enregistrée comme preuve)
 *   - 'customers' : User avec au moins 1 commande payée dans les 24 derniers
 *     mois ET emailDeliveryNotifications = true. Le statut "existing business
 *     relationship" donne 24 mois de implied consent pour des emails liés au
 *     commerce. Au-delà, il faut un opt-in explicite (qu'on n'a pas pour
 *     l'instant — donc on coupe à 24 mois).
 *   - 'all' : union des deux, dédupé par email lowercase
 *
 * Retourne toujours emails normalisés (lowercase trim).
 */

import { prisma } from '@/lib/db';

export type BroadcastSegment = 'newsletter' | 'customers' | 'all';

const IMPLIED_CONSENT_DAYS = 24 * 30; // 24 mois CASL

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
            status: { in: ['PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] },
            createdAt: { gte: cutoff },
          },
        },
      },
      select: { email: true },
    });
    return dedupe(users.map((u) => u.email));
  }

  // 'all' = union des deux
  const [newsletterEmails, customerEmails] = await Promise.all([
    resolveRecipients('newsletter'),
    resolveRecipients('customers'),
  ]);
  return dedupe([...newsletterEmails, ...customerEmails]);
}

export async function previewRecipientCount(segment: BroadcastSegment): Promise<number> {
  // Pour le preview, on fait juste un count sans charger les emails.
  // 'all' nécessite de résoudre vraiment (dédup), donc on accepte le coût.
  if (segment === 'all') {
    const emails = await resolveRecipients('all');
    return emails.length;
  }
  if (segment === 'newsletter') {
    return prisma.newsletterSubscriber.count({ where: { status: 'ACTIVE' } });
  }
  // customers — pas de count exact possible sans Prisma raw, donc on resolve.
  const emails = await resolveRecipients('customers');
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
