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
import ConfigureClient from '@/components/wizard/ConfigureClient';
import type { SinaliteOption } from '@/lib/sinalite/types';

export const metadata = { title: "Configure ta commande" };
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  productId: z.string().regex(/^\d+$/).transform(Number),
});

export default async function ConfigurePage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; designId?: string }>;
}) {
  const params = await searchParams;
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) notFound();

  const { productId } = parsed.data;
  const designId = params.designId ?? null;

  let product, detail;
  try {
    [product, detail] = await Promise.all([
      sinalite.getProduct(productId),
      sinalite.getProductDetail(productId),
    ]);
  } catch {
    notFound();
  }

  // Group options by `group` field
  const optionGroups: Record<string, SinaliteOption[]> = {};
  for (const opt of detail.options) {
    (optionGroups[opt.group] ??= []).push(opt);
  }

  // Default combo: lowest qty + first of each other group
  const defaultSelection: Record<string, number> = {};
  for (const [group, opts] of Object.entries(optionGroups)) {
    if (group === 'qty') {
      const sorted = [...opts].sort((a, b) => Number(a.name) - Number(b.name));
      if (sorted[0]) defaultSelection[group] = sorted[0].id;
    } else if (opts[0]) {
      defaultSelection[group] = opts[0].id;
    }
  }

  return (
    <ConfigureClient
      product={product}
      optionGroups={optionGroups}
      metadata={detail.metadata}
      defaultSelection={defaultSelection}
      designId={designId}
    />
  );
}
