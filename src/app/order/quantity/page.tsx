/**
 * /order/quantity — REDIRECT historique.
 *
 * L'étape Quantité a été FUSIONNÉE dans /order/configure (slider qty + prix live
 * dans le même écran). Cette route ne sert plus qu'à rediriger les liens hérités
 * (anciens emails, configs sauvegardées, flow reorder, signets) vers la config
 * fusionnée, en préservant productId + options + designId.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function QuantityRedirect({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; options?: string; designId?: string }>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  if (raw.productId) params.set('productId', raw.productId);
  if (raw.options) params.set('options', raw.options);
  if (raw.designId) params.set('designId', raw.designId);
  redirect(`/order/configure?${params.toString()}`);
}
