/**
 * Helper centralisé pour les counts de la AdminSidebar.
 *
 * Avant ce helper : 6 callsites hardcodaient `templates: 3, products: 468,
 * webhooks: 3`, donc l'admin voyait toujours les mêmes faux nombres dans
 * la nav, peu importe la croissance.
 *
 * Pattern : on fait toutes les queries en parallèle. Best-effort sur
 * chaque (catch → 0) pour pas crasher une page si une table manque.
 * Pas de caching pour MVP — chaque page admin re-query (< 50ms total
 * sur Neon vu que ce sont tous des count()/length).
 *
 * Pour des counts dynamiques type "X non-lus" / "Y urgents" (différents
 * du total brut), use `getAdminUrgentCounts()` séparément (existant
 * pattern dans /admin/notifications + dans la sidebar urgent badges).
 */

import { prisma } from '@/lib/db';
import { ALL_TEMPLATES } from '@/lib/templates/registry';

export interface AdminSidebarCounts {
  orders: number;
  users: number;
  webhooks: number;
  templates: number;
  /** Optional : si pas fourni, badge invisible (vs hardcoded 468 qui mentait). */
  products?: number;
  emails: number;
  reviews: number;
  messages: number;
  quotes: number;
  'reseller-applications': number;
  'promo-codes': number;
}

/**
 * Fetch tous les counts pour la AdminSidebar. Best-effort par query —
 * si une table manque (migration locale pas appliquée), on retourne 0
 * pour ce count plutôt que crasher.
 *
 * Note : `products` count requiert un call à l'API Sinalite (pas en DB),
 * trop coûteux pour chaque page admin. On le omet — la sidebar montre
 * juste le nom "Produits Sinalite" sans badge. /admin/products affiche
 * le vrai count sur sa propre page.
 */
export async function getAdminSidebarCounts(): Promise<AdminSidebarCounts> {
  return (await getAdminSidebarData()).counts;
}

/** Pastilles rouges « à traiter » de la sidebar — mêmes clés que AdminSidebarKey. */
export interface AdminSidebarUrgents {
  webhooks: boolean;
  emails: boolean;
  reviews: boolean;
  messages: boolean;
  quotes: boolean;
  'reseller-applications': boolean;
}

/**
 * Audit admin 2026-07 §5.1-§5.4 — SOURCE UNIQUE des counts ET des pastilles
 * urgentes de la sidebar, en UN batch de requêtes. Avant : ~17 pages passaient
 * des counts faits main (partiels) et chaque page n'allumait que SA pastille →
 * les badges changeaient d'une page à l'autre et l'admin ne pouvait pas s'y
 * fier. La sidebar appelle désormais ce helper ELLE-MÊME (composant serveur
 * async) → cohérence par construction sur les 31 pages.
 */
export async function getAdminSidebarData(): Promise<{
  counts: AdminSidebarCounts;
  urgents: AdminSidebarUrgents;
}> {
  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p; } catch { return fallback; }
  };

  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  const [
    orders, users, webhooks, emails,
    reviews, messages, quotes, resellerApps, promoCodes,
    failedWebhooks24h, deadEmails,
  ] = await Promise.all([
    safe(prisma.order.count(), 0),
    safe(prisma.user.count(), 0),
    safe(prisma.webhookEvent.count(), 0),
    safe(prisma.emailDelivery.count({ where: { status: { in: ['PENDING', 'FAILED'] } } }), 0),
    safe(prisma.review.count({ where: { status: 'PENDING' } }), 0),
    safe(prisma.contactMessage.count({ where: { status: 'OPEN' } }), 0),
    safe(prisma.customQuoteRequest.count({ where: { status: { in: ['NEW', 'IN_REVIEW'] } } }), 0),
    safe(prisma.resellerApplication.count({ where: { status: { in: ['NEW', 'PENDING_REVIEW'] } } }), 0),
    safe(prisma.promoCode.count({ where: { active: true } }), 0),
    // Urgents — mêmes définitions que les pages dédiées (webhooks/page failed24h,
    // emails/page DEAD) pour que la pastille dise la même chose partout.
    safe(prisma.webhookEvent.count({ where: { success: false, processedAt: { gte: yesterday } } }), 0),
    safe(prisma.emailDelivery.count({ where: { status: 'DEAD' } }), 0),
  ]);

  return {
    counts: {
      orders,
      users,
      webhooks,
      templates: ALL_TEMPLATES.length,
      // products omis volontairement — cf. doc ci-dessus
      emails,
      reviews,
      messages,
      quotes,
      'reseller-applications': resellerApps,
      'promo-codes': promoCodes,
    },
    urgents: {
      webhooks: failedWebhooks24h > 0,
      emails: deadEmails > 0,
      reviews: reviews > 0,
      messages: messages > 0,
      quotes: quotes > 0,
      'reseller-applications': resellerApps > 0,
    },
  };
}
