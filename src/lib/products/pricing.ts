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
 * ⚠️ FAIL-CLOSED SUR LA MARGE (audit pré-lancement 2026-07, P0-1/P0-2).
 * Avant, ce module retombait SILENCIEUSEMENT sur les prix Sinalite bruts
 * quand aucune override n'existait OU quand la DB était injoignable. Les deux
 * cas produisaient le même `null` → multiplicateur 1 → **vente au prix
 * coûtant**, sur les 10 chemins de prix (checkout, devis MCP, listes…).
 * Pire : le recalcul serveur retombait sur la même valeur, donc aucun
 * PRICE_MISMATCH ne se déclenchait — la perte était invisible.
 *
 * Deux changements :
 *   1. Plancher `DEFAULT_MARGIN_PCT` quand aucune override n'est configurée.
 *      Le code distingue toujours `null` (non configuré) de `0` (marge nulle
 *      VOULUE par l'admin) → aucune ambiguïté introduite.
 *   2. Une erreur DB n'est plus avalée : elle remonte. Un produit qui refuse
 *      de s'afficher est un incident VISIBLE ; un produit vendu à perte ne
 *      l'est pas.
 */

import { getVariantIndex as getRawVariantIndex } from '@/lib/sinalite/pricing';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';

export interface EnrichedVariantIndex {
  /** Map<canonicalKey, price> avec marginPct déjà appliqué. */
  index: Map<string, number>;
  /** Set d'option IDs à cacher du wizard customer. Vide si aucun. */
  hiddenOptionIds: Set<number>;
  /** Markup appliqué (display only — ex: "Marge +10%"). */
  marginPct: number | null;
  /** Produit désactivé par l'admin (ProductOverride.disabled) — retiré du catalogue. */
  disabled: boolean;
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

  const hiddenOptionIds = parseHiddenOptionIds(override?.hiddenOptionIds);
  const disabled = override?.disabled ?? false;

  // Court-circuit AVANT de résoudre la marge (revue money-path) : un produit
  // désactivé n'a pas à être coté. Sans ça, un produit `disabled` sans
  // marginPct — le cas le plus NORMAL, on désactive justement ce qu'on ne veut
  // pas vendre — ferait throw le plancher et rendrait inatteignable le
  // court-circuit propre `PRODUCT_DISABLED` (400, « produit indisponible ») de
  // price-order.ts. On renverrait un 500 opaque au lieu d'un message clair.
  if (disabled) {
    return { index: rawIndex, hiddenOptionIds, marginPct: null, disabled: true, variantCount };
  }

  // `?? ` et non `||` : une override à 0 % est une marge nulle VOULUE par
  // l'admin, elle ne doit PAS retomber sur le plancher.
  const marginPct = override?.marginPct ?? resolveDefaultMarginPct(productId);
  const multiplier = marginPct !== null ? 1 + marginPct / 100 : 1;

  // Build le map enrichi. Si pas de margin, on retourne le map original
  // pour économiser la copie + garder la référence cached partagée.
  const index = multiplier === 1
    ? rawIndex
    : new Map<string, number>(
        Array.from(rawIndex, ([k, price]) => [k, roundCents(price * multiplier)]),
      );

  return { index, hiddenOptionIds, marginPct, disabled, variantCount };
}

/**
 * Marge plancher appliquée quand AUCUNE override n'est configurée.
 *
 * Sans elle, un produit non configuré se vend au prix coûtant Sinalite (marge
 * zéro), et les rabais empilés (revendeur, promo, port GOLD) creusent sous le
 * coût. `DEFAULT_MARGIN_PCT` transforme l'oubli de configuration en marge par
 * défaut plutôt qu'en perte.
 *
 * Non configurée EN PRODUCTION → on REFUSE de coter (throw). C'est délibéré :
 * un catalogue en erreur se remarque en minutes, une vente à perte peut durer
 * des semaines. En dev/test, on retombe sur 0 (comportement historique) pour
 * ne pas exiger une var d'env locale.
 *
 * ⚠️ BORNES [-50, 500], entier — IDENTIQUES au contrat admin
 * (`api/admin/products/[id]/route.ts`, `z.number().int().min(-50).max(500)`).
 * Sans borne, `DEFAULT_MARGIN_PCT=-100` donnerait un multiplicateur de 0 →
 * TOUS les prix à 0,00 $. Et comme `lookupVariant` renverrait `0` (qui n'est
 * pas `null`), la garde `PRICE_FETCH_FAILED` ne se déclencherait pas, le
 * `expectedSubtotal` client vaudrait 0 comme le serveur → aucun
 * `PRICE_MISMATCH` : la commande partirait au seul prix du port. À `-150`, les
 * prix deviennent NÉGATIFS et soustraient du sous-total des autres articles.
 * Une valeur hors borne est traitée comme invalide (donc throw en prod), jamais
 * acceptée silencieusement.
 */
const MARGIN_PCT_MIN = -50;
const MARGIN_PCT_MAX = 500;

function resolveDefaultMarginPct(productId: number): number | null {
  const raw = process.env.DEFAULT_MARGIN_PCT?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= MARGIN_PCT_MIN && n <= MARGIN_PCT_MAX) return n;
    log.error(
      { productId, raw },
      `DEFAULT_MARGIN_PCT invalide — attendu un entier dans [${MARGIN_PCT_MIN}, ${MARGIN_PCT_MAX}]`,
    );
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Marge non configurée pour le produit ${productId} : aucune ProductOverride.marginPct ` +
        'et DEFAULT_MARGIN_PCT absente/invalide. Refus de coter au prix coûtant. ' +
        'Poser DEFAULT_MARGIN_PCT (env) ou la marge du produit dans /admin/products.',
    );
  }

  log.warn({ productId }, 'Aucune marge configurée (dev) — prix Sinalite bruts');
  return null;
}

/**
 * Lookup de l'override. NE PAS avaler les erreurs DB : un échec de lecture est
 * indistinguable d'une absence de ligne, et retomber sur `null` reviendrait à
 * vendre au prix coûtant (et à ré-activer un produit `disabled`) le temps du
 * blip. Le pooler Supabase rend ces erreurs transitoires plausibles.
 */
async function fetchOverride(productId: number) {
  try {
    return await prisma.productOverride.findUnique({
      where: { sinaliteProductId: productId },
    });
  } catch (err) {
    log.error({ err, productId }, 'Lecture ProductOverride échouée — refus de coter (fail-closed)');
    throw err;
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
