/**
 * Layout de /order/shipping — porte UNIQUEMENT le titre d'onglet.
 * Même cause que /order/upload : `page.tsx` est un Client Component, donc
 * son titre retombait sur celui de l'accueil. Cf. upload/layout.tsx.
 */

export const metadata = { title: 'Adresse de livraison' };

export default function ShippingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
