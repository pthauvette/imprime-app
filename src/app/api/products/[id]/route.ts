import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sinalite } from '@/lib/sinalite/client';
import {
  lookupVariant,
  supportsCustomSize,
  requiresRemotePricing,
} from '@/lib/sinalite/pricing';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
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

  // Audit-vérif Funnel #1 — on renvoie le prix MARKUP INCLUS (getEnrichedVariantIndex),
  // exactement comme /api/orders/create calcule le subtotal FACTURÉ. Avant, ce
  // endpoint renvoyait l'index BRUT alors que le wizard (configure/quantity) ET le
  // serveur utilisent l'enrichi → dès qu'une marge admin (marginPct) était posée,
  // l'expectedSubtotal (calculé ici, brut) ≠ subtotal serveur (enrichi) → le check
  // anti-tamper rejetait 100 % des checkouts du produit en PRICE_MISMATCH 409.
  // Complète l'audit v2 #6.2 (qui n'avait corrigé que /variants, pas ce single-price).
  const { index, marginPct, variantCount } = await getEnrichedVariantIndex(id);
  const price = lookupVariant(optionIds, index);

  if (price !== null) {
    return NextResponse.json({
      price,
      source: 'variants-index',
      variantCount,
      productId: id,
      optionIds,
    });
  }

  // Combo absente de l'index (exclusion / custom_size) → prix remote + markup
  // appliqué manuellement, même formule que orders/create (roundCents au cent).
  const multiplier = marginPct !== null ? 1 + marginPct / 100 : 1;
  const result = await sinalite.getPrice(id, optionIds);
  return NextResponse.json({
    price: Math.round(parseFloat(result.price) * multiplier * 100) / 100,
    packageInfo: result.packageInfo,
    productOptions: result.productOptions,
    source: 'remote-fallback',
    variantCount,
    productId: id,
    optionIds,
  });
});
