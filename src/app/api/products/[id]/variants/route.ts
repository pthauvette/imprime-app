import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sinalite } from '@/lib/sinalite/client';
import { withErrorHandler } from '@/lib/api-helpers';

/**
 * GET /api/products/[id]/variants?offset=0
 *
 * Renvoie jusqu'à 1000 variants {price, key} pour pricing local côté client.
 * Pagination: passe ?offset=1000 pour les 1000 suivants.
 *
 * Le `key` est sortedOptionIds.join('-') — utilise lookupVariant() côté client
 * pour résoudre un prix sans roundtrip.
 */

const ParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

const QuerySchema = z.object({
  offset: z.string().regex(/^\d+$/).transform(Number).optional().default('0'),
});

export const GET = withErrorHandler(async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = ParamsSchema.parse(await ctx.params);
  const url = new URL(req.url);
  const { offset } = QuerySchema.parse({
    offset: url.searchParams.get('offset') ?? '0',
  });

  const variants = await sinalite.listVariants(id, offset);

  return NextResponse.json({
    productId: id,
    offset,
    count: variants.length,
    /** True si plus de variants à charger (full page de 1000). */
    hasMore: variants.length === 1000,
    variants,
  });
});
