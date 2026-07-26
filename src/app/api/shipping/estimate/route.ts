import { NextResponse } from 'next/server';
import { sinalite } from '@/lib/sinalite/client';
import { SinaliteShippingEstimateRequest, isSupportedShipMethod } from '@/lib/sinalite/types';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { shippingQuoteToken } from '@/lib/shipping/quote-token';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { parseTurnaroundDays, computeDeliveryDate } from '@/lib/products/turnaround';
import { logSinalite } from '@/lib/logger';

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

  // finding [17] — l'ETA affichée ne comptait QUE le transit transporteur,
  // jamais le temps de PRODUCTION que le client a pourtant choisi et payé
  // (groupe Turnaround). On résout le délai de production réel par item
  // (cache 10 min, cf. getProductDetail) et on prend le PIRE cas sur un
  // panier multi-items : l'expédition ne part que quand TOUT est prêt.
  const productionDays = await resolveProductionDays(payload.items);

  const methods = result.body
    // Écarte les transporteurs que le pipeline create ne sait pas traiter (ex. Canpar) :
    // les offrir crasherait au create (ShipMethod strict). Cf. types.ts.
    .filter(([, method]) => isSupportedShipMethod(method))
    .map(([carrier, method, price, transitDays]) => {
      const { eta, ...breakdown } = computeDeliveryDate(today, productionDays, transitDays);
      return {
        carrier,
        method,
        price,
        days: transitDays,
        eta: eta.toISOString(),
        // Segments distincts pour l'affichage — cf. doc finding [17] :
        // « composer l'ETA … et l'afficher comme deux segments distincts ».
        ...breakdown,
        etaIncludesProduction: productionDays > 0,
        sig: shippingQuoteToken({
          method,
          price,
          country: payload.shippingInfo.ShipCountry,
          province: payload.shippingInfo.ShipState,
          postal: payload.shippingInfo.ShipZip,
          productIds,
        }),
      };
    });

  // Sort by price ascending — cheapest first
  methods.sort((a, b) => a.price - b.price);

  return NextResponse.json({
    methods,
    /** First option = recommandation par défaut. */
    recommended: methods[0]?.method,
  });
});

/**
 * Résout le délai de production (business days) du Turnaround SÉLECTIONNÉ
 * pour chaque item, prend le max (panier multi-items). `null`/absent →
 * traité comme 0 (fail-safe : on retombe sur le comportement historique —
 * transit seul — plutôt que d'inventer un chiffre non trouvé).
 */
async function resolveProductionDays(
  items: { productId: number; options: Record<string, string> }[],
): Promise<number> {
  let maxDays = 0;
  for (const item of items) {
    try {
      const detail = await sinalite.getProductDetail(item.productId);
      const selectedIds = new Set(Object.values(item.options).map(Number));
      const turnaroundOpt = detail.options.find(
        (o) => o.group === 'Turnaround' && selectedIds.has(o.id),
      );
      const days = turnaroundOpt ? parseTurnaroundDays(turnaroundOpt.name) : null;
      if (days !== null) maxDays = Math.max(maxDays, days);
    } catch (err) {
      // Best-effort : une panne ici ne doit jamais bloquer le devis de
      // livraison, juste faire retomber cet item sur transit seul.
      logSinalite.warn({ err, productId: item.productId }, 'resolveProductionDays: échec, transit seul');
    }
  }
  return maxDays;
}
