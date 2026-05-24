/**
 * Top product pairs for /compare?ids=X,Y SEO long-tail.
 *
 * Round 35. Round 29 #3 a livré /compare?ids=X,Y,Z. Cette page accepte
 * n'importe quelles combinaisons mais Google ne sait pas qu'elles existent
 * tant qu'on ne les met pas dans le sitemap.
 *
 * Stratégie : générer les paires des top-N produits les plus commandés
 * via Prisma. Pour N=10 → C(10, 2) = 45 URLs /compare. Long-tail SEO :
 * "carte 14pt vs 16pt", "carte vs flyer", etc.
 *
 * Architecture choice : pas de cron (over-engineered). Sitemap.ts est
 * dynamic SSR — appelé à la demande par Google. À chaque crawl, on recompute
 * les top N. Cost = 1 query Prisma groupBy par sitemap fetch (rare).
 *
 * Cap : top-10 produits → max 45 URLs. Au-delà, sitemap devient bruyant
 * et dilue le signal SEO.
 */

import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';

const TOP_N_PRODUCTS = 10;

/**
 * Returns top-N productId (par count d'orders status NOT CANCELLED/FAILED).
 * Si DB query échoue, retourne [] (sitemap reste fonctionnel sans /compare).
 */
export async function getTopProductIds(): Promise<number[]> {
  try {
    // Group Order par lookup dans sinalitePayload — c'est cher. Plus simple :
    // group OrderItem si on en avait une, mais on n'a que sinalitePayload JSON.
    // Pour MVP : on lit les `items` snapshot sur les orders 90 derniers jours
    // et on count par productId application-side. ~30-200 orders/mois donc OK.
    const recentOrders = await prisma.order.findMany({
      where: {
        status: { notIn: ['CANCELLED', 'FAILED', 'PENDING'] },
        paidAt: { gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
      },
      select: { itemsSnapshot: true },
      take: 1000, // safety cap
    });

    const counts = new Map<number, number>();
    for (const order of recentOrders) {
      if (!order.itemsSnapshot) continue;
      try {
        const items = JSON.parse(order.itemsSnapshot) as Array<{ productId?: number }>;
        for (const item of items) {
          if (typeof item.productId === 'number') {
            counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
          }
        }
      } catch {
        // Skip si itemsSnapshot corrompu (très rare, defensive)
      }
    }

    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N_PRODUCTS)
      .map(([id]) => id);

    return sorted;
  } catch (err) {
    log.warn({ err }, 'getTopProductIds: failed, returning empty list (sitemap continues)');
    return [];
  }
}

/**
 * Génère toutes les paires uniques (a, b) avec a < b depuis une liste de
 * productIds. Pour N=10 → 45 paires. Pure function, testable.
 */
export function buildPairs(productIds: number[]): Array<[number, number]> {
  const sorted = [...new Set(productIds)].sort((a, b) => a - b);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      pairs.push([sorted[i]!, sorted[j]!]);
    }
  }
  return pairs;
}

/**
 * Build les URLs /compare?ids=A,B pour chaque paire.
 */
export function buildCompareUrls(appUrl: string, pairs: Array<[number, number]>): string[] {
  return pairs.map(([a, b]) => `${appUrl}/compare?ids=${a},${b}`);
}
