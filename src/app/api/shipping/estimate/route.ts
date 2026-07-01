import { NextResponse } from 'next/server';
import { sinalite } from '@/lib/sinalite/client';
import { SinaliteShippingEstimateRequest, isSupportedShipMethod } from '@/lib/sinalite/types';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { shippingQuoteToken } from '@/lib/shipping/quote-token';
import { rateLimit, clientIp } from '@/lib/ratelimit';

/**
 * POST /api/shipping/estimate
 *
 * Body: { items: [{productId, options}], shippingInfo: {ShipState, ShipZip, ShipCountry: "CA"} }
 * Retourne les méthodes UPS/FedEx avec prix et délai.
 *
 * Réponse normalisée (object au lieu du tuple Sinalite):
 *   { methods: [{ carrier, method, price, days, eta, sig }] }
 *
 * Round 1 audit — chaque devis est SIGNÉ (sig HMAC liant méthode+prix+
 * destination+produits). Le client porte la sig jusqu'à /api/orders/create
 * qui la vérifie → anti-tamper sur shippingPrice sans re-appel Sinalite.
 */
export const POST = withErrorHandler(async (req: Request) => {
  // Audit v2 #6.4 — endpoint public non authentifié qui proxie vers Sinalite
  // (API payante). Rate-limit par IP avant tout appel coûteux.
  const limit = await rateLimit('shipping', clientIp(req));
  if (!limit.ok) return limit.response;

  const payload = await parseBody(req, SinaliteShippingEstimateRequest);
  const result = await sinalite.estimateShipping(payload);

  const productIds = payload.items.map((i) => i.productId);
  const today = new Date();
  const methods = result.body
    // Écarte les transporteurs que le pipeline create ne sait pas traiter (ex. Canpar) :
    // les offrir crasherait au create (ShipMethod strict). Cf. types.ts.
    .filter(([, method]) => isSupportedShipMethod(method))
    .map(([carrier, method, price, days]) => ({
    carrier,
    method,
    price,
    days,
    eta: addBusinessDays(today, days).toISOString(),
    sig: shippingQuoteToken({
      method,
      price,
      country: payload.shippingInfo.ShipCountry,
      province: payload.shippingInfo.ShipState,
      postal: payload.shippingInfo.ShipZip,
      productIds,
    }),
  }));

  // Sort by price ascending — cheapest first
  methods.sort((a, b) => a.price - b.price);

  return NextResponse.json({
    methods,
    /** First option = recommandation par défaut. */
    recommended: methods[0]?.method,
  });
});

function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    // Skip Sat (6) and Sun (0)
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}
