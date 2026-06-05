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
  if (!getVirtualProduct(slug)) notFound();
  const { designId } = await searchParams;
  return <VirtualProductPicker slug={slug} designId={designId ?? null} />;
}
