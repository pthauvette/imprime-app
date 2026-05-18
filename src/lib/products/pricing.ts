/**
 * Wrapper enrichi autour du variant index Sinalite + override admin.
 *
 * Applique :
 *   - marginPct (markup) — multiplie chaque prix par (1 + marginPct/100)
 *   - hiddenOptionIds — retourne la liste pour que les pages wizard
 *     filtrent les options avant de les présenter au customer
 *
 * Tous les call sites côté wizard + checkout passent par ici plutôt que
 * d'appeler getVariantIndex directement, pour que la pricing/visibilité
 * soit cohérente partout (configure, quantity, /api/orders/create).
 *
 * Si la DB est unreachable ou aucune override n'existe, on retombe
 * silencieusement sur les valeurs Sinalite brutes (pas de breakage).
 */

import { getVariantIndex as getRawVariantIndex } from '@/lib/sinalite/pricing';
import { prisma } from '@/lib/db';

export interface EnrichedVariantIndex {
  /** Map<canonicalKey, price> avec marginPct déjà appliqué. */
  index: Map<string, number>;
  /** Set d'option IDs à cacher du wizard customer. Vide si aucun. */
  hiddenOptionIds: Set<number>;
  /** Markup appliqué (display only — ex: "Marge +10%"). */
  marginPct: number | null;
  /** Number de variants dans l'index (pour debug). */
  variantCount: number;
}

/**
 * Récupère le variant index pour un produit, applique le markup admin
 * et expose la liste des options cachées.
 *
 * @param productId Sinalite product ID
 */
export async function getEnrichedVariantIndex(productId: number): Promise<EnrichedVariantIndex> {
  // Fetch parallèle : index Sinalite (potentiellement cached) + override DB
  const [{ index: rawIndex, variantCount }, override] = await Promise.all([
    getRawVariantIndex(productId),
    fetchOverride(productId),
  ]);

  const marginPct = override?.marginPct ?? null;
  const multiplier = marginPct !== null ? 1 + marginPct / 100 : 1;

  // Build le map enrichi. Si pas de margin, on retourne le map original
  // pour économiser la copie + garder la référence cached partagée.
  const index = multiplier === 1
    ? rawIndex
    : new Map<string, number>(
        Array.from(rawIndex, ([k, price]) => [k, roundCents(price * multiplier)]),
      );

  const hiddenOptionIds = parseHiddenOptionIds(override?.hiddenOptionIds);

  return { index, hiddenOptionIds, marginPct, variantCount };
}

/** Best-effort lookup de l'override. Retourne null si DB unreachable. */
async function fetchOverride(productId: number) {
  try {
    return await prisma.productOverride.findUnique({
      where: { sinaliteProductId: productId },
    });
  } catch {
    return null;
  }
}

/** Parse le JSON array d'option IDs cachés. Defensive contre corrompu. */
function parseHiddenOptionIds(raw: string | null | undefined): Set<number> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)));
  } catch {
    return new Set();
  }
}

/**
 * Arrondit au cent près. Le multiplicateur de margin peut produire des
 * décimales (ex: 47,21 × 1.10 = 51,931) ; on round à 2 décimales pour
 * que le user voie un prix propre + que l'expectedSubtotal côté checkout
 * ne diverge pas.
 */
function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
