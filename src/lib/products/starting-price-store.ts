/**
 * Prix vitrine « à partir de » des listes produits — côté SERVEUR.
 *
 * Lecture : getStartingPrices() = UNE requête DB sur ProductStartingPrice
 * (remplie par le cron refresh-product-prices). Tolérante : DB down → map
 * vide → la liste retombe sur « Voir prix → » (jamais de chiffre inventé,
 * même principe que le badge home #8.7).
 *
 * Écriture : refreshStartingPrices() balaie le catalogue par tranches avec
 * un BUDGET DE TEMPS (Lambda Amplify ~30 s max) : jamais-calculés d'abord,
 * puis les plus vieux (refreshOrder). Chaque produit = index Sinalite complet
 * (paginé, potentiellement lent) → upsert du min. Un échec individuel est
 * loggé et passé (retenté au prochain run, il reste le plus vieux).
 */

import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { sinalite } from '@/lib/sinalite/client';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { minTotalCents, refreshOrder } from '@/lib/products/starting-price';

/**
 * Prix minimal (cents, markup inclus) par productId — seulement ceux connus
 * ET exploitables. Un id absent de la map = pas encore balayé ou sans prix.
 */
export async function getStartingPrices(
  productIds: readonly number[],
): Promise<Map<number, number>> {
  if (productIds.length === 0) return new Map();
  try {
    const rows = await prisma.productStartingPrice.findMany({
      where: { sinaliteProductId: { in: [...productIds] }, minTotalCents: { not: null } },
      select: { sinaliteProductId: true, minTotalCents: true },
    });
    return new Map(rows.map((r) => [r.sinaliteProductId, r.minTotalCents!]));
  } catch (err) {
    // Best-effort marketing : la liste reste fonctionnelle sans prix.
    log.warn({ err }, 'starting-prices: lecture DB échouée, fallback sans prix');
    return new Map();
  }
}

export interface RefreshResult {
  /** Produits Sinalite actifs (univers du sweep). */
  totalEnabled: number;
  /** Produits recalculés + upsertés pendant ce run. */
  computed: number;
  /** Parmi les calculés : combien ont un prix exploitable (min non null). */
  priced: number;
  /** Échecs individuels (Sinalite down / produit retiré) — retentés au prochain run. */
  failed: number;
  /** Produits restants dans la file (pas atteints par le budget). */
  remaining: number;
}

/**
 * Une tranche de sweep. `budgetMs` borne le temps TOTAL (garder < timeout
 * Lambda) ; `maxProducts` borne le travail par run même si Sinalite est rapide.
 * Avec le cron horaire à 40 produits/run, tout le catalogue (~178) se
 * rafraîchit en ~5 h.
 */
export async function refreshStartingPrices({
  budgetMs = 18_000,
  maxProducts = 40,
}: { budgetMs?: number; maxProducts?: number } = {}): Promise<RefreshResult> {
  const start = Date.now();

  const all = await sinalite.listProducts();
  const enabled = all.filter((p) => p.enabled === 1);
  const rows = await prisma.productStartingPrice.findMany({
    select: { sinaliteProductId: true, computedAt: true },
  });
  const queue = refreshOrder(
    enabled.map((p) => p.id),
    new Map(rows.map((r) => [r.sinaliteProductId, r.computedAt])),
  );

  let computed = 0;
  let priced = 0;
  let failed = 0;
  for (const id of queue) {
    if (computed + failed >= maxProducts || Date.now() - start >= budgetMs) break;
    try {
      const enriched = await getEnrichedVariantIndex(id);
      const min = minTotalCents(enriched.index);
      await prisma.productStartingPrice.upsert({
        where: { sinaliteProductId: id },
        create: { sinaliteProductId: id, minTotalCents: min, variantCount: enriched.variantCount },
        update: { minTotalCents: min, variantCount: enriched.variantCount, computedAt: new Date() },
      });
      computed++;
      if (min !== null) priced++;
    } catch (err) {
      // Pas de retry ici : l'item reste le plus vieux → repris au prochain run.
      failed++;
      log.warn({ err, productId: id }, 'starting-prices: calcul échoué, sera retenté');
    }
  }

  return {
    totalEnabled: enabled.length,
    computed,
    priced,
    failed,
    remaining: queue.length - computed - failed,
  };
}
