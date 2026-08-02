/**
 * Résolution du prix d'UNE combinaison d'options : index local, puis repli
 * distant chez Sinalite.
 *
 * POURQUOI (bug rapporté par un agent MCP, 2026-08) : « le catalogue annonce
 * des produits que le moteur de prix n'a pas ». `get_print_quote` renvoyait
 * « Prix indisponible » pour flyers et cartes-postales sur TOUTES les
 * combinaisons essayées, alors que le site cote les mêmes produits sans
 * broncher.
 *
 * Cause : l'index de variantes est un cache PARTIEL. Pour le produit 37
 * (flyer 100lb sans couche), il contient 1000 entrées qui ne couvrent que les
 * deux plus petits paliers de quantité — pas 500, pas 1000, pas 25000. C'est
 * exactement ce que `lib/sinalite/pricing.ts` annonce depuis toujours : « si la
 * combo n'est pas dans l'index (exclusion, custom_size, etc.), l'appelant doit
 * retomber sur POST /price ». Le checkout (`price-order.ts`) fait ce repli ; le
 * configurateur l'a reçu en 2026-07 (`/api/products/[id]/price`) après le même
 * symptôme côté client ; le MCP ne l'a jamais eu. Il traitait donc `null` —
 * « pas dans mon cache » — comme « ce produit n'est pas vendable », et refusait
 * de coter ce que Plio facture très bien.
 *
 * ⚠️ LA MARGE EST LE POINT DÉLICAT. Les prix de l'index la portent DÉJÀ ; le
 * prix distant est BRUT. On l'applique donc ici, avec le même arrondi au cent
 * que `price-order.ts` — un écart d'un cent entre le devis et le recalcul
 * serveur déclencherait un PRICE_MISMATCH au checkout, ce qui est pire que
 * l'absence de devis.
 *
 * ⚠️ LES GARDES SONT DANS CE FICHIER, PAS CHEZ LES APPELANTS. La revue
 * money-path l'a exigé et la raison est nette : en production,
 * `marginPct === null` est IMPOSSIBLE autrement que pour un produit désactivé
 * (`resolveDefaultMarginPct` throw sinon). Or `getEnrichedVariantIndex` renvoie
 * justement `{index: BRUT, marginPct: null}` dans ce cas. Un appelant qui
 * oublierait de tester `disabled` vendrait donc AU PRIX COÛTANT, en silence et
 * avec un CI vert. Trois `if (enriched.disabled)` recopiés à la main, c'est le
 * motif exact qui a produit la régression #357 — on prend l'objet enrichi
 * ENTIER et on refuse ici, une fois pour toutes.
 */

import { sinalite } from '@/lib/sinalite/client';
import { lookupVariant } from '@/lib/sinalite/pricing';
import type { EnrichedVariantIndex } from './pricing';
import { logSinalite } from '@/lib/logger';

/** Parité avec `/api/products/[id]/price` : une liste absurde ne part pas chez Sinalite. */
const MAX_OPTION_IDS = 40;

// ── Mémo du repli distant ───────────────────────────────────────────────────
// Le repli était pensé comme RARE. Le diagnostic ci-dessus établit l'inverse :
// pour des familles entières, l'index ne couvre aucun palier utile, donc il
// devient le chemin DOMINANT. Or `get_print_quote` et `configure_print` sont
// publics et sans authentification (600 req/min agrégées) : sans mémo, chaque
// requête pourrait acheter un POST /price facturé et NON caché.
//
// Le mémo borne la facture, et surtout il STABILISE devis ↔ checkout :
// `resolveOrderItem` puis `priceOrder` interrogent la même valeur au lieu de
// deux appels distants potentiellement décorrélés.
//
// TTL court (60 s) : on borne l'abus sans figer un prix Sinalite qui bouge.
const MEMO_TTL_MS = 60_000;
const MEMO_MAX = 5_000; // borne mémoire ; au-delà on repart à zéro (cache, pas source de vérité)
const memo = new Map<string, { price: number; at: number }>();

function canonicalKey(optionIds: number[]): string {
  return [...optionIds].sort((a, b) => a - b).join('-');
}

/** Vidage du mémo — exposé pour les tests (et un éventuel invalidateur admin). */
export function clearRemotePriceMemo(): void {
  memo.clear();
}

/**
 * Prix (dollars) d'une combinaison, marge incluse.
 *
 * Renvoie `null` quand aucun prix ne doit être établi : produit désactivé,
 * option masquée, combinaison réellement invalide, ou Sinalite injoignable.
 * On ne devine JAMAIS un prix — un chiffre inventé finirait dans un devis.
 */
export async function resolveVariantPrice(
  productId: number,
  optionIds: number[],
  enriched: EnrichedVariantIndex,
): Promise<number | null> {
  const { index, marginPct, hiddenOptionIds, disabled } = enriched;

  // Produit retiré du catalogue par l'admin : aucun prix, jamais. Cf. l'avertissement
  // en tête de fichier — c'est ici que ça se joue, pas chez l'appelant.
  if (disabled) return null;

  // Bornes d'entrée, à parité avec le jumeau web.
  if (optionIds.length === 0 || optionIds.length > MAX_OPTION_IDS) return null;

  // Une option masquée par l'admin ne doit pas devenir tarifable en la forgeant.
  // Les appelants MCP filtrent déjà en amont (`groupVisibleOptions`), mais la
  // défense en profondeur appartient au point de passage obligé.
  if (optionIds.some((id) => hiddenOptionIds.has(id))) return null;

  // 1) Index local — gratuit, O(1), marge déjà appliquée.
  const local = lookupVariant(optionIds, index);
  if (local !== null) return local;

  // 2) Repli distant, mémoïsé.
  const cle = `${productId}:${canonicalKey(optionIds)}`;
  const hit = memo.get(cle);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.price;

  try {
    const remote = await sinalite.getPrice(productId, optionIds);
    const raw = parseFloat(remote.price);
    // Un prix nul ou absurde n'est PAS un prix : mieux vaut « indisponible »
    // que de coter 0,00 $ et laisser commander à perte.
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const multiplier = marginPct !== null ? 1 + marginPct / 100 : 1;
    const price = Math.round(raw * multiplier * 100) / 100;
    // Seuls les SUCCÈS sont mémoïsés : mettre un échec en cache masquerait le
    // rétablissement de Sinalite pendant tout le TTL.
    if (memo.size >= MEMO_MAX) memo.clear();
    memo.set(cle, { price, at: Date.now() });
    return price;
  } catch (err) {
    logSinalite.warn(
      { err, productId, optionCount: optionIds.length },
      'prix live: repli distant échoué (MCP)',
    );
    return null;
  }
}
