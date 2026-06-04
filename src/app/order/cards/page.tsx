/**
 * /order/cards — sélecteur Papier × Finition du PRODUIT VIRTUEL « Carte de visite ».
 *
 * Remplace l'étape « product » (qui listait 25 productId Sinalite quasi-identiques)
 * pour la famille cartes. Le choix papier+finition résout vers un productId réel,
 * puis renvoie au wizard de configuration normal (/order/configure?productId=…).
 *
 * Pilote (demande user) ; généralisable aux autres form-factors plats ensuite.
 */

import CardPickerClient from '@/components/wizard/CardPickerClient';

export const metadata = { title: 'Carte de visite — papier & finition' };
export const dynamic = 'force-dynamic';

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ designId?: string }>;
}) {
  const { designId } = await searchParams;
  return <CardPickerClient designId={designId ?? null} />;
}
