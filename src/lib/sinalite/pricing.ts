/**
 * Pricing local — résolution O(1) côté serveur via la matrice de variants.
 *
 * Architecture:
 *   1. Au premier lookup pour un produit, on pagine GET
 *      /variants/{id}/{storeCode}/{offset} (1000 par page) dans un BUDGET DE
 *      TEMPS — l'index est une optimisation, pas la source de vérité.
 *   2. On construit un Map<key, price> où key = sortedOptionIds.join('-').
 *   3. L'index est mis en cache in-memory avec TTL de 10 min.
 *   4. Lookups subséquents = O(1) sans roundtrip.
 *
 * Fallback:
 *   - Si la combo n'est pas dans l'index (index partiel, exclusion,
 *     custom_size…), l'appelant retombe sur POST /price/{id}/{storeCode}.
 *
 * Historique:
 *   J'ai essayé md5(sortedOptionIds.join('-')) en première implémentation
 *   parce que le demo source de Sinalite a une fonction `md5c`, mais l'algo
 *   est plus complexe (sub-combinaisons), donc remplacé par variants index.
 *
 *   « Pour les gros produits (> 10k variants), l'index devient gros — à
 *   mesurer. » C'est MESURÉ (2026-08) : 101 produits, 676 625 variantes,
 *   médiane 720, **pire 90 520** (18,5 s de construction, 1,9 Mo sérialisés).
 *   D'où le budget de temps ci-dessous ET le fait que la page configure
 *   n'envoie plus la matrice entière au navigateur (cf. variant-slice.ts).
 */

import { sinalite } from './client';
import { log } from '@/lib/logger';

// ─── INDEX CACHE ──────────────────────────────────────────────────────────

interface CachedIndex {
  index: Map<string, number>;
  builtAt: number;
  variantCount: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_VARIANTS_TO_INDEX = 50_000; // garde-fou dur
/**
 * Budget de construction. MESURÉ (2026-08, catalogue réel) : ~100-200 ms par
 * page de 1000. Le plus gros produit du catalogue (43) compte **90 520
 * variantes** = 91 pages = **18,5 s** — impensable sur un rendu de page.
 *
 * L'index n'est PAS le chemin de correction, c'est une OPTIMISATION : ce qui
 * manque part en repli distant (`sinalite.getPrice`, memoïsé). On préfère donc
 * un index partiel construit vite à un index complet construit trop tard.
 *
 * Repère : avant le correctif d'URL, la boucle faisait 50 appels IDENTIQUES
 * (~5 s) pour un index plafonné à 1000 entrées, soit 5 % du produit 37. Avec
 * ce budget on en indexe ~12 000 en 2 fois moins de temps.
 */
const BUDGET_CONSTRUCTION_MS = 2_500;
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

  // Construction incrémentale : on n'accumule PAS les lignes brutes avant de
  // bâtir la Map (le plus gros produit du catalogue en a 90 520 — les garder
  // deux fois en mémoire sur Lambda n'a aucun intérêt).
  const index = new Map<string, number>();
  const debut = Date.now();
  let offset = 0;
  let recues = 0;
  let complet = false;
  while (offset < MAX_VARIANTS_TO_INDEX) {
    const page = await sinalite.listVariants(productId, offset);
    const avant = index.size;
    for (const v of page) index.set(canonicalKey(v.key.split('-').map(Number)), v.price);
    recues += page.length;

    // GARDE ANTI-SUR-PLACE. Une page qui n'apporte AUCUNE clé nouvelle veut
    // dire que l'API ignore l'offset et resert la même page. C'est exactement
    // ce qui s'est produit pendant des mois (cf. listVariants) : la boucle
    // tournait 50 fois, en silence, et l'index restait plafonné à 1000. Sans
    // ce garde, la panne est invisible — le seul symptôme est un prix
    // « indisponible » ailleurs dans l'app, des semaines plus tard.
    if (page.length > 0 && index.size === avant) {
      log.error(
        { productId, offset, variantesIndexees: index.size },
        'variants: page sans nouveauté — l’API ignore probablement l’offset, index TRONQUÉ',
      );
      break;
    }
    if (page.length < 1000) { complet = true; break; }
    offset += 1000;

    // Budget de temps — cf. BUDGET_CONSTRUCTION_MS. On s'arrête AVANT de payer
    // une page de plus, pas après.
    if (Date.now() - debut >= BUDGET_CONSTRUCTION_MS) break;
  }

  // Index partiel = état NORMAL et assumé sur les gros produits, mais il doit
  // être VISIBLE : muet, ce cas se confond avec « ce produit n'a pas de prix »,
  // et c'est précisément ce qui a rendu le bug d'URL indétectable pendant des
  // mois. Le repli distant couvre le manque.
  if (!complet) {
    log.warn(
      { productId, variantesIndexees: index.size, ms: Date.now() - debut },
      'variants: index PARTIEL (budget ou plafond atteint) — le repli distant couvrira le reste',
    );
  }

  cache.set(productId, { index, builtAt: Date.now(), variantCount: recues });

  return { index, fromCache: false, variantCount: recues };
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
