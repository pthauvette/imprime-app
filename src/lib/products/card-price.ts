/**
 * Fetcher du prix vitrine « cartes d'affaires » — Audit v2 #8.7.
 *
 * Server-only : croise getProductDetail (groupe qty) + index enrichi (markup
 * admin inclus) puis délègue le calcul au helper pur bestUnitPrice().
 *
 * Tolérant aux pannes : au build/CI Sinalite est injoignable → retourne null,
 * le composant appelant retombe alors sur une formulation sans chiffre.
 *
 * Caché 10 min (= TTL catalogue Sinalite) pour borner les lectures DB de l'index
 * sans décaler le badge du tarif réel affiché au wizard.
 */

import { unstable_cache } from 'next/cache';
import { sinalite } from '@/lib/sinalite/client';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import {
  BUSINESS_CARD_PRODUCT_ID,
  quantityByOptionId,
  bestUnitPrice,
  type BestUnitPrice,
} from '@/lib/products/starting-price';

async function fetchCardStartingPrice(): Promise<BestUnitPrice | null> {
  try {
    const [detail, enriched] = await Promise.all([
      sinalite.getProductDetail(BUSINESS_CARD_PRODUCT_ID),
      getEnrichedVariantIndex(BUSINESS_CARD_PRODUCT_ID),
    ]);
    const qtyById = quantityByOptionId(detail.options, enriched.hiddenOptionIds);
    return bestUnitPrice(enriched.index, qtyById);
  } catch {
    // Sinalite down / build stub → pas de prix dynamique, fallback côté caller.
    return null;
  }
}

/**
 * Meilleur prix/carte des cartes d'affaires (markup inclus) + sa quantité, ou
 * null si indisponible. Caché 10 min, tag `card-starting-price`.
 */
export const getCardStartingPrice = unstable_cache(
  fetchCardStartingPrice,
  ['card-starting-price-v1'],
  { revalidate: 600, tags: ['card-starting-price'] },
);
