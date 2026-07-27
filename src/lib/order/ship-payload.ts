/**
 * Sérialise le « ship » (contact + adresse + méthode + devis signé) passé dans
 * l'URL du wizard de commande.
 *
 * Audit v2 #4.2 — SOURCE UNIQUE pour les deux usages : le `nextHref` vers
 * /order/review ET le `resumeQuery` de l'abandoned-cart. Avant, ces deux objets
 * étaient construits inline séparément et avaient divergé : le resumeQuery
 * OMETTAIT `sig` (signature anti-tamper du devis livraison) → tout checkout de
 * recovery arrivait « devis non signé », bloquant le flip du garde shipping de
 * log-only → reject 409. Une seule fonction garantit qu'ils restent identiques.
 */

export interface ShipPayloadInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  method: string;
  price: number;
  /** Signature anti-tamper du devis de livraison choisi. NE JAMAIS omettre. */
  sig: string;
  /** Instructions de livraison libres (optionnel). */
  note?: string;
  /** finding [17] — jours production/transit du devis choisi (déjà calculés
   *  par /api/shipping/estimate), portés jusqu'à /order/review pour l'ETA
   *  honnête post-achat. PAS couverts par `sig` (n'affectent pas le prix). */
  productionDays?: number;
  transitDays?: number;
}

export function buildShipPayload(input: ShipPayloadInput): string {
  const trimmedNote = input.note?.trim();
  return JSON.stringify({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    line1: input.line1,
    line2: input.line2,
    city: input.city,
    province: input.province,
    postalCode: input.postalCode,
    method: input.method,
    price: input.price,
    sig: input.sig,
    ...(trimmedNote ? { note: trimmedNote.slice(0, 200) } : {}),
    ...(typeof input.productionDays === 'number' ? { productionDays: input.productionDays } : {}),
    ...(typeof input.transitDays === 'number' ? { transitDays: input.transitDays } : {}),
  });
}
