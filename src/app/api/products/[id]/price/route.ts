/**
 * POST /api/products/[id]/price — prix d'UNE combinaison d'options.
 *
 * POURQUOI CETTE ROUTE EXISTE (bug rapporté 2026-07 : « le prix ne s'affiche pas
 * pour certains produits ») : le configurateur ne lisait QUE l'index de variantes
 * pré-construit (`variantIndex[key] ?? null`). Or `lib/sinalite/pricing.ts` le dit
 * lui-même — « si la combo n'est pas dans l'index (exclusion, custom_size, etc.),
 * l'appelant doit retomber sur POST /price ». Le chemin de COMMANDE fait ce repli
 * (`price-order.ts`), le configurateur ne le faisait PAS.
 *
 * Conséquence pour le client : « Prix indisponible pour cette combinaison » ET
 * les boutons « Sauver » / « Téléverser » désactivés → produit INCOMMANDABLE,
 * alors que le checkout aurait su le tarifer. Le message invitait à « ajuster une
 * option », ce qui ne changeait rien : le trou est structurel (matrice partielle
 * chez Sinalite, produits `custom_size`/`shapes`).
 *
 * Cette route rétablit la symétrie configurateur ↔ commande. Elle applique la
 * MÊME marge que l'index (getEnrichedVariantIndex) pour que le prix affiché soit
 * exactement celui facturé — un écart ici déclencherait un PRICE_MISMATCH au
 * checkout, pire que l'absence de prix.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sinalite } from '@/lib/sinalite/client';
import { lookupVariant } from '@/lib/sinalite/pricing';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { logSinalite } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

const BodySchema = z.object({
  /** IDs d'options SÉLECTIONNÉES, qty comprise. Bornés : une liste absurde ne
   *  doit pas partir chez Sinalite. */
  optionIds: z.array(z.number().int().positive()).min(1).max(40),
});

export const POST = withErrorHandler(async (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  // Rate-limit AVANT tout appel Sinalite : la route est publique et proxie une
  // API payante (même profil que /api/shipping/estimate).
  const limite = await rateLimit('productPrice', clientIp(req));
  if (!limite.ok) return limite.response;

  const { id: productId } = ParamsSchema.parse(await ctx.params);
  const { optionIds } = await parseBody(req, BodySchema);

  const enriched = await getEnrichedVariantIndex(productId);

  // Produit désactivé par l'admin : on ne cote pas. Même sémantique que
  // price-order.ts (PRODUCT_DISABLED), pour que le configurateur et le checkout
  // racontent la même histoire.
  if (enriched.disabled) {
    return NextResponse.json(
      { error: 'Produit indisponible.', code: 'PRODUCT_DISABLED' },
      { status: 400 },
    );
  }

  // Une option masquée par l'admin ne doit pas être tarifable en la forgeant.
  if (optionIds.some((oid) => enriched.hiddenOptionIds.has(oid))) {
    return NextResponse.json(
      { error: 'Option indisponible.', code: 'OPTION_HIDDEN' },
      { status: 400 },
    );
  }

  const multiplier = enriched.marginPct !== null ? 1 + enriched.marginPct / 100 : 1;

  // 1) Index local d'abord — gratuit et O(1). Il porte DÉJÀ la marge.
  const local = lookupVariant(optionIds, enriched.index);
  if (local !== null) {
    return NextResponse.json({ price: local, source: 'index' });
  }

  // 2) Repli distant — le chemin que le configurateur n'avait pas.
  try {
    const remote = await sinalite.getPrice(productId, optionIds);
    const raw = parseFloat(remote.price);
    if (!Number.isFinite(raw) || raw <= 0) {
      // Un prix nul/absurde n'est PAS un prix : mieux vaut « indisponible » que
      // d'afficher 0,00 $ et laisser commander à perte.
      return NextResponse.json(
        { error: "Prix indisponible chez l'imprimeur.", code: 'PRICE_FETCH_FAILED' },
        { status: 502 },
      );
    }
    // Marge appliquée ICI (le prix distant est brut), arrondie au cent comme
    // l'index — sinon l'affichage et la facturation divergeraient d'un cent.
    const price = Math.round(raw * multiplier * 100) / 100;
    return NextResponse.json({ price, source: 'remote' });
  } catch (err) {
    logSinalite.warn(
      { err, productId, optionCount: optionIds.length },
      'prix live: repli distant échoué (configurateur)',
    );
    return NextResponse.json(
      { error: "Prix indisponible chez l'imprimeur.", code: 'PRICE_FETCH_FAILED' },
      { status: 502 },
    );
  }
});
