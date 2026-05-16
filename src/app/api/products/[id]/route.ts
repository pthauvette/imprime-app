import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sinalite } from '@/lib/sinalite/client';
import {
  getVariantIndex,
  lookupVariant,
  supportsCustomSize,
  requiresRemotePricing,
} from '@/lib/sinalite/pricing';
import { withErrorHandler } from '@/lib/api-helpers';

/**
 * GET /api/products/[id]
 *
 * Retourne le détail d'un produit avec :
 *  - product (id, sku, name, category)
 *  - options groupées par `group` (qty, Stock, size, Coating, etc.)
 *  - metadata flags (custom_size, shapes)
 *  - canPriceLocally — true si on peut résoudre le prix via md5 (false pour roll labels)
 *
 * Le pricing matrix lui-même n'est PAS exposé (volumineux + interne).
 * Pour récupérer un prix : POST /api/products/[id]/price ou utiliser /variants.
 */

const ParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

export const GET = withErrorHandler(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = ParamsSchema.parse(await ctx.params);

  const [product, detail] = await Promise.all([
    sinalite.getProduct(id),
    sinalite.getProductDetail(id),
  ]);

  // Group options by `group` name for UI consumption
  const optionsByGroup = detail.options.reduce<Record<string, typeof detail.options>>(
    (acc, opt) => {
      (acc[opt.group] ??= []).push(opt);
      return acc;
    },
    {},
  );

  return NextResponse.json({
    product,
    optionGroups: optionsByGroup,
    metadata: detail.metadata,
    flags: {
      supportsCustomSize: supportsCustomSize(detail.metadata),
      requiresRemotePricing: requiresRemotePricing(detail.metadata),
    },
    /** Sample default combo for quick preview (lowest qty + first Stock + first size). */
    defaultCombo: pickDefaultCombo(optionsByGroup),
  });
});

function pickDefaultCombo(
  groups: Record<string, { id: number; group: string; name: string }[]>,
): number[] {
  const combo: number[] = [];
  for (const [group, opts] of Object.entries(groups)) {
    if (group === 'qty') {
      // Pick the lowest numeric qty
      const sorted = [...opts].sort((a, b) => Number(a.name) - Number(b.name));
      if (sorted[0]) combo.push(sorted[0].id);
    } else {
      if (opts[0]) combo.push(opts[0].id);
    }
  }
  return combo;
}

/**
 * POST /api/products/[id]/price
 * Body: { optionIds: number[] }
 *
 * Retourne le prix LIVE pour une combinaison d'options.
 * Préfère /variants pour bulk lookup ; ce endpoint = 1 lookup par appel.
 */
const PriceBodySchema = z.object({
  optionIds: z.array(z.number()).min(1),
});

export const POST = withErrorHandler(async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = ParamsSchema.parse(await ctx.params);
  const { optionIds } = PriceBodySchema.parse(await req.json());

  // Try variants index first — O(1) once built, in-memory cache 10 min TTL.
  const { index, fromCache, variantCount } = await getVariantIndex(id);
  const price = lookupVariant(optionIds, index);

  if (price !== null) {
    return NextResponse.json({
      price,
      source: 'variants-index',
      cache: fromCache ? 'hit' : 'miss',
      variantCount,
      productId: id,
      optionIds,
    });
  }

  // Combo absente de l'index → exclusion ou custom_size → fallback remote
  const result = await sinalite.getPrice(id, optionIds);
  return NextResponse.json({
    price: parseFloat(result.price),
    packageInfo: result.packageInfo,
    productOptions: result.productOptions,
    source: 'remote-fallback',
    cache: 'index-miss',
    variantCount,
    productId: id,
    optionIds,
  });
});
