/**
 * /order/configure?productId=N — Step 3 wizard : configuration.
 *
 * Server Component: fetch produit + détails + group options par `group`,
 * pré-calcule la sélection par défaut (lowest qty + first of each), puis
 * délègue à <ConfigureClient /> pour l'interactivité.
 */

import { notFound } from 'next/navigation';
import { z } from 'zod';
import { sinalite } from '@/lib/sinalite/client';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import ConfigureClient from '@/components/wizard/ConfigureClient';
import type { SinaliteOption } from '@/lib/sinalite/types';
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd';

export const metadata = { title: "Configure ta commande" };
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  productId: z.string().regex(/^\d+$/).transform(Number),
});

export default async function ConfigurePage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; designId?: string; options?: string }>;
}) {
  const params = await searchParams;
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) notFound();

  const { productId } = parsed.data;
  const designId = params.designId ?? null;

  let product, detail, enrichedIndex;
  try {
    [product, detail, enrichedIndex] = await Promise.all([
      sinalite.getProduct(productId),
      sinalite.getProductDetail(productId),
      getEnrichedVariantIndex(productId),
    ]);
  } catch {
    notFound();
  }

  // Serialize variant index Map → Record for client serialization. Prix
  // déjà markés up via marginPct admin (cf. lib/products/pricing.ts).
  const variantIndex: Record<string, number> = {};
  enrichedIndex.index.forEach((price, key) => {
    variantIndex[key] = price;
  });
  const hiddenOptionIds = enrichedIndex.hiddenOptionIds;

  // Group options by `group` field, en filtrant celles cachées par l'admin
  // (ProductOverride.hiddenOptionIds). Cohérent avec QuantityClient qui
  // applique le même filtre.
  const optionGroups: Record<string, SinaliteOption[]> = {};
  for (const opt of detail.options) {
    if (hiddenOptionIds.has(opt.id)) continue;
    (optionGroups[opt.group] ??= []).push(opt);
  }

  // Parse les options pré-sélectionnées depuis l'URL (flow reorder).
  // Format : ?options=ID1,ID2,ID3 — on map chaque ID vers son groupe.
  // Si un ID n'existe pas dans ce produit (ex: produit a changé de SKUs),
  // on l'ignore silencieusement et le default kicks in.
  const prefilledOptionIds = new Set<number>(
    (params.options ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );

  // Default combo: lowest qty + first of each other group, MAIS si on a des
  // options pré-sélectionnées (reorder flow), on les utilise en priorité.
  const defaultSelection: Record<string, number> = {};
  for (const [group, opts] of Object.entries(optionGroups)) {
    const prefilled = opts.find((o) => prefilledOptionIds.has(o.id));
    if (prefilled) {
      defaultSelection[group] = prefilled.id;
    } else if (group === 'qty') {
      const sorted = [...opts].sort((a, b) => Number(a.name) - Number(b.name));
      if (sorted[0]) defaultSelection[group] = sorted[0].id;
    } else if (opts[0]) {
      defaultSelection[group] = opts[0].id;
    }
  }

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: 'Accueil', path: '/' },
        { name: 'Commander', path: '/order/start' },
        { name: product.name ?? 'Produit', path: `/order/configure?productId=${productId}` },
      ])} />
      <ConfigureClient
        product={product}
        optionGroups={optionGroups}
        metadata={detail.metadata}
        defaultSelection={defaultSelection}
        designId={designId}
        variantIndex={variantIndex}
      />
    </>
  );
}
