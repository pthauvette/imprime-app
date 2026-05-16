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
import { getVariantIndex } from '@/lib/sinalite/pricing';
import QuantityClient from '@/components/wizard/QuantityClient';
import type { SinaliteOption } from '@/lib/sinalite/types';

export const metadata = { title: "Combien d'unités ?" };
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  productId: z.string().regex(/^\d+$/).transform(Number),
  options: z.string().regex(/^\d+(,\d+)*$/).transform((s) => s.split(',').map(Number)),
});

export default async function QuantityPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; options?: string }>;
}) {
  const raw = await searchParams;
  const parsed = ParamsSchema.safeParse({
    productId: raw.productId,
    options: raw.options ?? '',
  });
  if (!parsed.success) notFound();

  const { productId, options: baseOptionIds } = parsed.data;

  let product, detail, variantIndexMap;
  try {
    [product, detail, { index: variantIndexMap }] = await Promise.all([
      sinalite.getProduct(productId),
      sinalite.getProductDetail(productId),
      getVariantIndex(productId),
    ]);
  } catch {
    notFound();
  }

  // Extract qty + turnaround groups from product options
  const qtyOptions: SinaliteOption[] = detail.options.filter((o) => o.group === 'qty');
  const turnaroundOptions: SinaliteOption[] = detail.options.filter((o) => o.group === 'Turnaround');

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
    />
  );
}
