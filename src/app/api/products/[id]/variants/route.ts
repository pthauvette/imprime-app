import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { withErrorHandler } from '@/lib/api-helpers';

/**
 * GET /api/products/[id]/variants
 *
 * Renvoie les variants { price, key } pour pricing local côté client.
 * Le `key` est sortedOptionIds.join('-') — utilise lookupVariant() côté client.
 *
 * Audit v2 #6.2 — AVANT : renvoyait `sinalite.listVariants()` = les prix de GROS
 * BRUTS de Sinalite (notre coût d'achat), sans markup. Endpoint public → fuite
 * de l'intel concurrentielle (marge, cost basis). MAINTENANT : on passe par
 * getEnrichedVariantIndex (le MÊME index marked-up que le wizard utilise), donc
 * on ne renvoie que les prix de DÉTAIL. La pagination (offset/hasMore) devient
 * vestigiale : l'index enrichi est complet et déjà chargé server-side ; on
 * renvoie tout d'un coup avec hasMore:false (pas de boucle infinie côté caller).
 */

const ParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

export const GET = withErrorHandler(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = ParamsSchema.parse(await ctx.params);

  const enriched = await getEnrichedVariantIndex(id);
  const variants = Array.from(enriched.index, ([key, price]) => ({ key, price }));

  return NextResponse.json({
    productId: id,
    offset: 0,
    count: variants.length,
    hasMore: false,
    variants,
  });
});
