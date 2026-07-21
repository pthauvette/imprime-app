/**
 * Devis de livraison signé (Round 1 audit) — anti-tamper sur shippingPrice.
 *
 * Le subtotal est recomputé + vérifié server-side dans /api/orders/create, mais
 * le shippingPrice venait BRUT du client → un client pouvait le baisser et
 * sous-payer la livraison (fuite de marge). Re-demander un devis Sinalite dans
 * le chemin de paiement = latence + mode d'échec au pire moment. À la place :
 * /api/shipping/estimate SIGNE chaque devis (HMAC), le client porte la sig
 * jusqu'au create, et create la VÉRIFIE — sans appel Sinalite supplémentaire.
 *
 * La signature lie le prix aux inputs qui le déterminent : méthode + prix +
 * destination (pays/province/code postal) + produits du panier. Changer l'un
 * d'eux invalide la sig. (Résiduel connu : un swap de quantité/options à
 * produits identiques n'est pas couvert — c'est un compromis assumé vs lier la
 * forme exacte des items, qui diffère entre estimate et create.)
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { signingSecret } from '@/lib/crypto/signing-secret';

export interface ShippingQuoteFields {
  method: string;
  /** Prix en dollars (number) — normalisé en cents dans la canonical. */
  price: number;
  /** 'CA' */
  country: string;
  /** Province (CaProvince) — ShipState côté estimate, shippingAddress.province côté create. */
  province: string;
  /** Code postal — normalisé (uppercase, sans espace). */
  postal: string;
  /** productIds du panier (ordre indifférent — triés dans la canonical). */
  productIds: number[];
}

function canonical(f: ShippingQuoteFields): string {
  const cents = Math.round(f.price * 100);
  const postal = (f.postal ?? '').toUpperCase().replace(/\s+/g, '');
  const pids = [...f.productIds].sort((a, b) => a - b).join(',');
  return `ship-quote:v1:${f.method}|${cents}|${f.country}|${f.province}|${postal}|${pids}`;
}

export function shippingQuoteToken(f: ShippingQuoteFields): string {
  const secret = signingSecret('devis de livraison');
  return createHmac('sha256', secret).update(canonical(f)).digest('hex').slice(0, 32);
}

export function verifyShippingQuoteToken(f: ShippingQuoteFields, token: string | undefined | null): boolean {
  if (!token) return false;
  const expected = shippingQuoteToken(f);
  if (expected.length !== token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(token, 'utf8'));
  } catch {
    return false;
  }
}
