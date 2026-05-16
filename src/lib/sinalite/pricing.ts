/**
 * Pricing local — résolution O(1) côté serveur via la matrice de variants.
 *
 * Architecture:
 *   1. Au premier lookup pour un produit, on appelle GET /variants/{id}/{offset}
 *      en boucle jusqu'à avoir tout (1000 par page).
 *   2. On construit un Map<key, price> où key = sortedOptionIds.join('-').
 *   3. L'index est mis en cache in-memory avec TTL de 10 min.
 *   4. Lookups subséquents = O(1) sans roundtrip.
 *
 * Fallback:
 *   - Si la combo n'est pas dans l'index (exclusion, custom_size, etc.),
 *     l'appelant doit retomber sur POST /price/{id}/{storeCode}.
 *
 * Historique:
 *   J'ai essayé md5(sortedOptionIds.join('-')) en première implémentation
 *   parce que le demo source de Sinalite a une fonction `md5c`, mais l'algo
 *   est plus complexe (sub-combinaisons), donc remplacé par variants index.
 *   Pour les gros produits (> 10k variants), l'index devient gros — à mesurer.
 */

import { sinalite } from './client';
import type { SinaliteVariant } from './types';

// ─── INDEX CACHE ──────────────────────────────────────────────────────────

interface CachedIndex {
  index: Map<string, number>;
  builtAt: number;
  variantCount: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_VARIANTS_TO_INDEX = 50_000; // safety guardrail
const cache = new Map<number, CachedIndex>();

/**
 * Renvoie l'index de variants pour un produit, en utilisant le cache si possible.
 * Construit l'index la première fois (peut prendre plusieurs secondes pour les
 * gros catalogues, mais ensuite c'est O(1)).
 */
export async function getVariantIndex(productId: number): Promise<{
  index: Map<string, number>;
  fromCache: boolean;
  variantCount: number;
}> {
  const cached = cache.get(productId);
  if (cached && Date.now() - cached.builtAt < TTL_MS) {
    return { index: cached.index, fromCache: true, variantCount: cached.variantCount };
  }

  // Build index from paginated variants
  const allVariants: SinaliteVariant[] = [];
  let offset = 0;
  while (offset < MAX_VARIANTS_TO_INDEX) {
    const page = await sinalite.listVariants(productId, offset);
    allVariants.push(...page);
    if (page.length < 1000) break;
    offset += 1000;
  }

  const index = buildVariantIndex(allVariants);
  cache.set(productId, {
    index,
    builtAt: Date.now(),
    variantCount: allVariants.length,
  });

  return { index, fromCache: false, variantCount: allVariants.length };
}

/** Lookup O(1). Renvoie null si la combo n'existe pas (caller doit fallback). */
export function lookupVariant(
  selectedOptionIds: number[],
  index: Map<string, number>,
): number | null {
  const key = canonicalKey(selectedOptionIds);
  return index.get(key) ?? null;
}

/** Reset du cache pour un produit (utile après un changement de catalogue Sinalite). */
export function invalidateVariantCache(productId?: number) {
  if (productId === undefined) cache.clear();
  else cache.delete(productId);
}

// ─── INTERNAL ─────────────────────────────────────────────────────────────

/** Trie ascendant, joint par '-' — format compatible avec /variants. */
function canonicalKey(optionIds: number[]): string {
  return [...optionIds].sort((a, b) => a - b).join('-');
}

function buildVariantIndex(variants: SinaliteVariant[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const v of variants) {
    // Sinalite already returns keys in sorted order, but normalize defensively
    const normalized = canonicalKey(v.key.split('-').map(Number));
    index.set(normalized, v.price);
  }
  return index;
}

// ─── PRODUCT FLAGS ────────────────────────────────────────────────────────

/**
 * Détecte si un produit nécessite l'API distante pour le pricing
 * (vrai pour les roll labels qui ont une data structure différente).
 */
export function requiresRemotePricing(metadata: string[]): boolean {
  return metadata.includes('shapes');
}

/**
 * Détecte si un produit accepte les tailles personnalisées WxH.
 * Si oui, le size option peut être passé comme string "5x6" au lieu d'un option ID.
 */
export function supportsCustomSize(metadata: string[]): boolean {
  return metadata.includes('custom_size');
}
