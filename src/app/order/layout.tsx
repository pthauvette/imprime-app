/**
 * Layout pour /order/* — toutes les étapes du wizard.
 *
 * Ajoute le FloatingHelpButton (bouton "Besoin d'aide ?" persistant) sur chaque
 * page du wizard.
 *
 * Audit-vérif M1 — SÉCURITÉ : on ne résout PLUS la session côté serveur ici.
 * /order/* est servable à des visiteurs ANONYMES (pas dans PROTECTED_PREFIXES),
 * et le runtime SSR Amplify resert par intermittence un rendu connecté à une
 * requête anonyme → rendre email/nom de session dans le HTML SSR fuyait la PII
 * d'un AUTRE user (même incident que HeaderUserSlot, #197/#198). Le préremplissage
 * du help modal est désormais fait CÔTÉ CLIENT par FloatingHelpButton (qui fetch
 * /api/auth/session avec le cookie du vrai visiteur). Zéro PII de session en SSR.
 */

import FloatingHelpButton from '@/components/support/FloatingHelpButton';

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FloatingHelpButton />
    </>
  );
}
