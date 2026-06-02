/**
 * Détection des « carts coincés » (Round 46) — diagnostic admin lecture seule.
 *
 * Un AbandonedCart « coincé » = claimé (emailSentAt set par le cron) mais
 * JAMAIS réellement emailé, à cause d'un crash en plein traitement (avant le
 * fix d'isolation #195, ou si le reset best-effort du catch échoue lui aussi).
 * Conséquence : silent loss — le client ne reçoit pas sa relance ET le cart
 * n'est plus ré-éligible (emailSentAt != null → exclu du findMany du cron).
 *
 * Piège central : beaucoup de carts sont claimés-sans-EmailDelivery de façon
 * LÉGITIME — review (skip 95 % conversion), convertis (commande arrivée par un
 * autre chemin), suppressed (hard bounce/plainte, skippé AVANT la queue par
 * queueEmail). Il faut les exclure pour ne pas noyer le vrai signal.
 *
 * Stratégie en 2 étapes (perf + clarté) :
 *   1. SQL cheap : candidats = claimé récent, pas review, AUCUNE EmailDelivery
 *      'abandoned-cart:<id>'. Le NOT EXISTS sur le label élimine la MASSE des
 *      carts correctement envoyés (la grande majorité).
 *   2. JS : sur le petit ensemble restant, on rassemble le contexte (converti ?
 *      supprimé ? âge ?) et on applique isStuck() — la vraie définition métier.
 */

import { prisma } from '@/lib/db';

/** Lookback : on remonte les carts claimés des 30 derniers jours (au-delà,
 *  l'info perd sa valeur). Borne aussi le coût de la requête. */
const LOOKBACK_DAYS = 30;

/** Recovery window du cron (24-72 h depuis l'abandon). Un cart coincé encore
 *  dans cette fenêtre est RÉCUPÉRABLE : remettre emailSentAt=null le rend
 *  ré-éligible au prochain run. Au-delà, c'est un silent-loss définitif. */
const RECOVERY_WINDOW_HOURS = 72;

export interface StuckCartCandidate {
  id: string;
  email: string;
  productId: number;
  lastStep: string;
  emailSentAt: Date;
  updatedAt: Date;
}

export interface StuckCartContext {
  /** Une commande existe pour cet email APRÈS l'abandon (cart.updatedAt) → converti. */
  converted: boolean;
  /** Email dans EmailSuppression (hard bounce / plainte) → skip légitime, pas coincé. */
  suppressed: boolean;
  /** Heures écoulées depuis l'abandon (cart.updatedAt). Recovery window = 24-72 h :
   *  au-delà de 72 h, remettre emailSentAt=null ne le rendra plus éligible. */
  hoursSinceAbandon: number;
}

/**
 * Définition métier de « coincé » = silent-loss. Le candidat est DÉJÀ filtré
 * côté SQL (claimé, pas review, aucune EmailDelivery). On exclut ici les skips
 * LÉGITIMES restants :
 *   - converted : le client a commandé autrement → pas besoin de relance.
 *   - suppressed : adresse en hard-bounce/plainte → ne JAMAIS ré-envoyer.
 *
 * L'ÂGE n'entre PAS dans cette définition : un cart expiré reste un silent-loss
 * réel (un client n'a pas reçu sa relance). La fenêtre de récupérabilité est
 * une dimension séparée (cf. `recoverable` dans StuckCart), pour distinguer
 * « encore actionnable » de « perdu, mais utile à la stat ».
 *
 * NB throttle (cap CASL 5/j) : indétectable rétroactivement (fenêtre glissante,
 * non persistée par cart) → un cart throttlé peut apparaître ici. Bruit rare et
 * assumé ; mieux vaut un faux positif visible qu'un silent-loss masqué.
 */
export function isStuck(cart: StuckCartCandidate, ctx: StuckCartContext): boolean {
  return !ctx.converted && !ctx.suppressed;
}

/** Un cart coincé enrichi pour l'affichage admin. */
export interface StuckCart extends StuckCartCandidate {
  /** Encore dans la fenêtre 72 h → un reset emailSentAt=null le récupère. */
  recoverable: boolean;
  /** Heures écoulées depuis l'abandon (pour affichage + tri). */
  hoursSinceAbandon: number;
}

/**
 * Retourne les carts coincés (candidats SQL filtrés par isStuck), enrichis du
 * flag `recoverable`, récupérables d'abord puis du plus récent au plus ancien.
 * Lecture seule — aucun side-effect.
 */
export async function findStuckCarts(): Promise<StuckCart[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);

  // 1. Candidats (SQL cheap). Le NOT EXISTS sur le label 'abandoned-cart:<id>'
  //    élimine tous les carts qui ONT bien généré une EmailDelivery.
  const candidates = await prisma.$queryRaw<StuckCartCandidate[]>`
    SELECT ac.id, ac.email, ac."productId", ac."lastStep",
           ac."emailSentAt", ac."updatedAt"
    FROM "AbandonedCart" ac
    WHERE ac."emailSentAt" IS NOT NULL
      AND ac."emailSentAt" >= ${since}
      AND ac."lastStep" <> 'review'
      AND NOT EXISTS (
        SELECT 1 FROM "EmailDelivery" ed
        WHERE ed.label = 'abandoned-cart:' || ac.id
      )
    ORDER BY ac."emailSentAt" DESC
    LIMIT 200
  `;
  if (candidates.length === 0) return [];

  // 2. Contexte batch (1 query orders + 1 query suppressions) pour les emails.
  const emails = [...new Set(candidates.map((c) => c.email))];
  const [orders, suppressions] = await Promise.all([
    prisma.order.findMany({
      where: { user: { email: { in: emails } } },
      select: { createdAt: true, user: { select: { email: true } } },
    }),
    prisma.emailSuppression.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    }),
  ]);
  const suppressedSet = new Set(suppressions.map((s) => s.email));

  // 3. Applique le prédicat métier, enrichit, trie.
  const stuck: StuckCart[] = [];
  for (const cart of candidates) {
    const abandonedAt = new Date(cart.updatedAt).getTime();
    const converted = orders.some(
      (o) => o.user?.email === cart.email && new Date(o.createdAt).getTime() >= abandonedAt,
    );
    const hoursSinceAbandon = (Date.now() - abandonedAt) / 3_600_000;
    if (!isStuck(cart, { converted, suppressed: suppressedSet.has(cart.email), hoursSinceAbandon })) {
      continue;
    }
    stuck.push({ ...cart, hoursSinceAbandon, recoverable: hoursSinceAbandon <= RECOVERY_WINDOW_HOURS });
  }
  // Récupérables d'abord (actionnables), puis du plus récent au plus ancien.
  return stuck.sort(
    (a, b) => Number(b.recoverable) - Number(a.recoverable) || a.hoursSinceAbandon - b.hoursSinceAbandon,
  );
}
