/**
 * /order/cards — REDIRECT (back-compat).
 *
 * Le sélecteur de cartes est devenu le produit virtuel générique
 * /order/v/cartes-de-visite. On garde cette route pour les liens hérités
 * (le pilote initial, signets, E2E historiques), en préservant designId.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';

export const dynamic = 'force-dynamic';

export default async function CardsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ designId?: string }>;
}) {
  const { designId } = await searchParams;
  // Cast : /order/v/[slug] est une route dynamique → le path concret n'est pas
  // inféré par les typed-routes Next.
  redirect((`/order/v/cartes-de-visite${designId ? `?designId=${designId}` : ''}`) as Route);
}
