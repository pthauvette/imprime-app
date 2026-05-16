import { NextResponse } from 'next/server';
import { sinalite } from '@/lib/sinalite/client';
import { SinaliteShippingEstimateRequest } from '@/lib/sinalite/types';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';

/**
 * POST /api/shipping/estimate
 *
 * Body: { items: [{productId, options}], shippingInfo: {ShipState, ShipZip, ShipCountry: "CA"} }
 * Retourne les méthodes UPS/FedEx avec prix et délai.
 *
 * Réponse normalisée (object au lieu du tuple Sinalite):
 *   { methods: [{ carrier, method, price, days, eta }] }
 */
export const POST = withErrorHandler(async (req: Request) => {
  const payload = await parseBody(req, SinaliteShippingEstimateRequest);
  const result = await sinalite.estimateShipping(payload);

  const today = new Date();
  const methods = result.body.map(([carrier, method, price, days]) => ({
    carrier,
    method,
    price,
    days,
    eta: addBusinessDays(today, days).toISOString(),
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
