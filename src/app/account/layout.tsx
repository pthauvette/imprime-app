/**
 * Layout pour /account et ses sous-routes (favorites, referrals, api-keys, wallet).
 *
 * finding [52] — le bouton d'aide flottant n'existait QUE sous /order/*,
 * absent partout ailleurs dans le compte. Même composant, même rationale
 * SSR/PII que order/layout.tsx (résolution de session côté client).
 */

import FloatingHelpButton from '@/components/support/FloatingHelpButton';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FloatingHelpButton />
    </>
  );
}
