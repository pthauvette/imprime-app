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
import JsonLd, { breadcrumbSchema, productSchema } from '@/components/seo/JsonLd';
import { logSinalite } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';

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
  } catch (err) {
    // Round 37 #2 — Avant : `catch { notFound() }` silencieux masquait
    // les vrais errors (timeout Sinalite, auth fail) en "Page not found".
    // Customer abandonnait, admin n'avait aucune visibilité.
    //
    // Maintenant : on log + alert Slack (throttled par les helpers downstream)
    // puis re-throw. error.tsx render proper "service temporairement
    // indisponible" et customer comprend que ce n'est pas une URL invalide.
    //
    // Edge case : si le productId est vraiment invalide (404 Sinalite legit
    // pour ce specific ID), le err.statusCode === 404 — on retombe à
    // notFound() dans ce cas-là uniquement.
    const isNotFound = err instanceof Error &&
      'statusCode' in err && (err as { statusCode?: number }).statusCode === 404;
    if (isNotFound) {
      notFound();
    }
    logSinalite.error(
      { err, productId },
      'sinalite fetch failed on /order/configure — render error.tsx',
    );
    void sendCriticalAlert({
      severity: 'warning',
      title: 'Sinalite fetch failed on /order/configure',
      body: `Product ${productId} fetch failed. Customer redirected to error page. Investigue.`,
      context: { productId, error: err instanceof Error ? err.message : 'unknown' },
    });
    throw err; // → error.tsx (Next.js boundary)
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

  // ─── Compute price range pour AggregateOffer schema ─────────────────
  // On scanne le variantIndex (déjà markup admin appliqué) pour donner
  // un range CAD à Google. Si toutes les valeurs sont 0/missing on omet.
  const priceValues = Object.values(variantIndex).filter((v) => v > 0);
  const priceCents = priceValues.length > 0
    ? {
        low: Math.round(Math.min(...priceValues) * 100),
        high: Math.round(Math.max(...priceValues) * 100),
      }
    : null;

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: 'Accueil', path: '/' },
        { name: 'Commander', path: '/order/start' },
        { name: product.name ?? 'Produit', path: `/order/configure?productId=${productId}` },
      ])} />
      <JsonLd
        data={productSchema({
          id: productId,
          name: product.name?.trim() || `Produit Plio #${productId}`,
          description: detail.metadata?.join(' ') ?? null,
          sku: product.sku ?? null,
          category: product.category ?? null,
          priceCents,
          pageUrl: `/order/configure?productId=${productId}`,
        })}
      />
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
