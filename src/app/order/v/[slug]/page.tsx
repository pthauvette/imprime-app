/**
 * /order/v/[slug] — sélecteur Papier × Finition d'un PRODUIT VIRTUEL.
 *
 * Remplace l'étape « product » (qui listait N productId Sinalite quasi-identiques)
 * pour les familles « flat-print » (cartes de visite, cartes postales, …). Le
 * choix papier+finition résout vers un productId réel, puis renvoie au wizard de
 * configuration normal (/order/configure?productId=…).
 */

import { notFound } from 'next/navigation';
import VirtualProductPicker from '@/components/wizard/VirtualProductPicker';
import { getVirtualProduct } from '@/lib/products/virtual-products';
import { sinalite } from '@/lib/sinalite/client';
import { applyProductOverrides } from '@/lib/products/overrides';
import { getStartingPrices } from '@/lib/products/starting-price-store';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vp = getVirtualProduct(slug);
  return { title: vp ? `${vp.name} — papier & finition` : 'Produit' };
}

export default async function VirtualProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ designId?: string }>;
}) {
  const { slug } = await params;
  const vp = getVirtualProduct(slug);
  if (!vp) notFound();
  const { designId } = await searchParams;

  // Audit v3 L1 — ne proposer que les variants dont le productId est RÉELLEMENT
  // actif (enabled Sinalite + non désactivé par override admin), sinon l'user
  // traverse tout le wizard avant un rejet PRODUCT_DISABLED au paiement.
  const allProducts = await sinalite.listProducts();
  const active = await applyProductOverrides(allProducts.filter((p) => p.enabled === 1));
  const activeIds = new Set(active.map((p) => p.id));
  const allowedProductIds = vp.variants.map((v) => v.productId).filter((id) => activeIds.has(id));

  // Tout le produit virtuel est désactivé → indisponible.
  if (allowedProductIds.length === 0) notFound();

  // finding [3]/[15] — 20 combinaisons papier × finition sans un seul prix
  // affiché ; `getStartingPrices` (table ProductStartingPrice, remplie par le
  // cron refresh-product-prices) sert déjà /order/product, jamais ce picker.
  // Best-effort : Map non sérialisable telle quelle vers un Client Component
  // → converti en objet simple ; un id absent (pas encore balayé par le cron)
  // garde son fallback « Voir prix → » côté client, jamais de chiffre inventé.
  const priceMap = await getStartingPrices(allowedProductIds);
  const pricesByProductId = Object.fromEntries(priceMap);

  return (
    <VirtualProductPicker
      slug={slug}
      designId={designId ?? null}
      allowedProductIds={allowedProductIds}
      pricesByProductId={pricesByProductId}
    />
  );
}
