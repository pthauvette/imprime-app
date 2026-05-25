/**
 * /order/quantity?productId=N&options=4,30,107,224,78 — Step 4 wizard.
 *
 * Server Component:
 *  1. Parse URL (productId + options[] from Step 3)
 *  2. Fetch product + detail (pour qty + turnaround options) + variants index
 *  3. Build Map<key, price> et passer à <QuantityClient />
 *
 * Le client résout les prix en O(1) à chaque drag du slider — zéro roundtrip.
 */

import { notFound } from 'next/navigation';
import { z } from 'zod';
import { sinalite } from '@/lib/sinalite/client';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import QuantityClient from '@/components/wizard/QuantityClient';
import type { SinaliteOption } from '@/lib/sinalite/types';
import { logSinalite } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';

export const metadata = { title: "Combien d'unités ?" };
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  productId: z.string().regex(/^\d+$/).transform(Number),
  options: z.string().regex(/^\d+(,\d+)*$/).transform((s) => s.split(',').map(Number)),
});

export default async function QuantityPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; options?: string; designId?: string }>;
}) {
  const raw = await searchParams;
  const parsed = ParamsSchema.safeParse({
    productId: raw.productId,
    options: raw.options ?? '',
  });
  if (!parsed.success) notFound();
  const designId = raw.designId ?? null;

  const { productId, options: baseOptionIds } = parsed.data;

  let product, detail, enrichedIndex;
  try {
    [product, detail, enrichedIndex] = await Promise.all([
      sinalite.getProduct(productId),
      sinalite.getProductDetail(productId),
      getEnrichedVariantIndex(productId),
    ]);
  } catch (err) {
    // Round 37 #2 — Avant : silent notFound() masquait les Sinalite errors
    // (timeout, auth fail). Customer abandonnait, admin invisible.
    // Maintenant : 404 réel pour productId invalide, error.tsx + Slack
    // pour les vrais errors.
    const isNotFound = err instanceof Error &&
      'statusCode' in err && (err as { statusCode?: number }).statusCode === 404;
    if (isNotFound) {
      notFound();
    }
    logSinalite.error(
      { err, productId },
      'sinalite fetch failed on /order/quantity — render error.tsx',
    );
    void sendCriticalAlert({
      severity: 'warning',
      title: 'Sinalite fetch failed on /order/quantity',
      body: `Product ${productId} fetch failed. Customer redirected to error page.`,
      context: { productId, error: err instanceof Error ? err.message : 'unknown' },
    });
    throw err;
  }
  const variantIndexMap = enrichedIndex.index;
  const hiddenOptionIds = enrichedIndex.hiddenOptionIds;

  // Extract qty + turnaround groups from product options. Filtre les options
  // cachées par l'admin (ProductOverride.hiddenOptionIds) — cohérent avec
  // configure/page.tsx, sinon l'user pourrait quand même choisir une qty
  // hidden depuis l'URL et obtenir un prix.
  const qtyOptions: SinaliteOption[] = detail.options.filter((o) => o.group === 'qty' && !hiddenOptionIds.has(o.id));
  const turnaroundOptions: SinaliteOption[] = detail.options.filter((o) => o.group === 'Turnaround' && !hiddenOptionIds.has(o.id));

  if (qtyOptions.length === 0) {
    // Some products may not have a "qty" group — handle gracefully
    notFound();
  }

  // Find default turnaround from URL options (if Step 3 included one)
  const turnaroundIdSet = new Set(turnaroundOptions.map((o) => o.id));
  const defaultTurnaroundId = baseOptionIds.find((id) => turnaroundIdSet.has(id)) ?? turnaroundOptions[0]?.id;

  // Serialize Map → Record for client serialization
  const variantIndex: Record<string, number> = {};
  variantIndexMap.forEach((price, key) => {
    variantIndex[key] = price;
  });

  return (
    <QuantityClient
      product={product}
      baseOptionIds={baseOptionIds}
      qtyOptions={qtyOptions}
      turnaroundOptions={turnaroundOptions}
      variantIndex={variantIndex}
      defaultTurnaroundId={defaultTurnaroundId}
      designId={designId}
    />
  );
}
