/**
 * Helpers product-overrides : merge des produits Sinalite avec les
 * surcharges admin stockées en DB (ProductOverride).
 *
 * Pattern : un seul SELECT sur ProductOverride par requête (toutes les
 * surcharges actives), puis merge in-memory. Pas de N+1.
 *
 * Si la table ProductOverride n'existe pas encore (migration pas appliquée
 * en local dev sans DB), on retourne les produits Sinalite tels quels —
 * surfaçant pas d'erreur.
 */

import { prisma } from '@/lib/db';
import type { SinaliteProduct } from '@/lib/sinalite/types';
import { marketingNameFor } from './marketing-names';

export type EnrichedProduct = SinaliteProduct & {
  /** Présent si l'admin a posé un override (sinon merge identité). */
  override?: {
    featured: boolean;
    displayName: string | null;
    displayDescription: string | null;
    marginPct: number | null;
  };
  /** Sous-texte marketing curé (cf. marketing-names.ts). Absent = non curé. */
  marketingDesc?: string;
};

/**
 * Filtre + enrichit une liste de produits Sinalite :
 *  1. Charge tous les overrides en un SELECT
 *  2. Filtre les disabled (admin) en plus de Sinalite enabled=0
 *  3. Applique displayName/Description si set
 *  4. Stamp `featured` pour l'UI
 *
 * Si la DB est unreachable (ex: build local sans Postgres), on log et on
 * retourne la liste brute pour pas bloquer le catalogue.
 */
export async function applyProductOverrides(
  products: SinaliteProduct[],
): Promise<EnrichedProduct[]> {
  let overrides: Awaited<ReturnType<typeof prisma.productOverride.findMany>> = [];
  try {
    overrides = await prisma.productOverride.findMany({});
  } catch {
    // DB unreachable ou table pas migrée : on retourne les produits Sinalite
    // tels quels. Pas de filtering admin mais au moins le catalogue marche.
    return products;
  }

  const byId = new Map(overrides.map((o) => [o.sinaliteProductId, o]));
  const result: EnrichedProduct[] = [];
  for (const p of products) {
    const o = byId.get(p.id);
    if (o?.disabled) continue; // hide du catalogue customer

    // Précédence du nom affiché : override admin (DB, sans redéploiement) >
    // nom marketing curé (marketing-names.ts, versionné) > nom Sinalite brut.
    // Sans la couche marketing, le jargon fournisseur atteignait le client
    // (« Business cards 14pt (Profit Maximizer) » — un palier de MARGE).
    const marketing = marketingNameFor(p.id);
    const name = o?.displayName ?? marketing?.name ?? p.name;

    result.push({
      ...p,
      name,
      ...(marketing ? { marketingDesc: marketing.desc } : {}),
      ...(o
        ? {
            override: {
              featured: o.featured,
              displayName: o.displayName,
              displayDescription: o.displayDescription,
              marginPct: o.marginPct,
            },
          }
        : {}),
    });
  }
  return result;
}

/**
 * Récupère un Map<sinaliteProductId, ProductOverride> pour l'admin UI.
 * Permet d'afficher l'état override de chaque ligne du catalogue admin.
 */
export async function fetchOverridesMap(): Promise<
  Map<number, Awaited<ReturnType<typeof prisma.productOverride.findFirst>>>
> {
  try {
    const list = await prisma.productOverride.findMany({});
    return new Map(list.map((o) => [o.sinaliteProductId, o]));
  } catch {
    return new Map();
  }
}
