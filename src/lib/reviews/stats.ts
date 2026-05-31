/**
 * getReviewStats — source UNIQUE et vérifiable du social proof (Round 45 #1).
 *
 * Pourquoi : le tunnel (/order/start) + la home + sign-in/sign-up affichaient
 * des claims EN DUR et FAUX : « 4,9/5 — 12k+ avis Trustpilot », « 47 commandes
 * dans la dernière heure ». Aucun compte Trustpilot, chiffres inventés →
 * risque légal (pub trompeuse, Loi sur la concurrence CA) + perte de crédibilité
 * si un client vérifie.
 *
 * Maintenant : ces sites consomment getReviewStats(), qui agrège les vraies
 * Review APPROVED (modérées par l'admin). Le flag `display` n'est vrai que si
 * on a atteint un seuil minimal d'avis (MIN_REVIEWS_TO_DISPLAY) — en dessous,
 * les consommateurs masquent le bloc étoiles et retombent sur des arguments
 * FACTUELS non-chiffrés (prix wholesale, livraison Canada, sans abonnement),
 * vrais par construction. Zéro claim invérifiable.
 */

import { prisma } from '@/lib/db';

/** En-dessous de ce nombre d'avis approuvés, on n'affiche pas de note (un
 *  « 5/5 sur 1 avis » n'est pas un signal crédible). */
export const MIN_REVIEWS_TO_DISPLAY = 5;

export interface ReviewStats {
  /** Nombre d'avis APPROVED. */
  count: number;
  /** Moyenne des ratings (1 décimale), ou null si aucun avis. */
  avgRating: number | null;
  /** true si count >= seuil → les consommateurs peuvent afficher la note. */
  display: boolean;
}

/**
 * Agrège les avis APPROVED. Best-effort : si la table n'est pas migrée ou la
 * DB répond mal, retourne un état « pas d'affichage » plutôt que de throw —
 * le social proof est décoratif, il ne doit jamais casser une page.
 */
export async function getReviewStats(): Promise<ReviewStats> {
  try {
    const agg = await prisma.review.aggregate({
      where: { status: 'APPROVED' },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const count = agg._count._all;
    const avgRating = agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null;
    return {
      count,
      avgRating,
      display: count >= MIN_REVIEWS_TO_DISPLAY && avgRating != null,
    };
  } catch {
    return { count: 0, avgRating: null, display: false };
  }
}
