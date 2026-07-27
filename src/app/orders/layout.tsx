/**
 * Layout pour /orders et /orders/[id].
 *
 * finding [52] — le bouton d'aide flottant n'existait QUE sous /order/*,
 * absent de la liste de commandes et du détail d'une commande.
 */

import FloatingHelpButton from '@/components/support/FloatingHelpButton';

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FloatingHelpButton />
    </>
  );
}
