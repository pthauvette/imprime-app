/**
 * Point de passage unique du garde « téléphone vérifié » pour /drafts.
 *
 * POURQUOI UN LAYOUT ET NON UN APPEL PAR PAGE. La politique « téléphone
 * obligatoire » (décision Patrick, 2026-08) n'était appliquée que sur
 * `/orders/page.tsx` — donc pas même sur `/orders/[id]`, et sur aucune des huit
 * autres surfaces de compte. Un client pouvait s'inscrire et utiliser son
 * portefeuille, ses paiements et ses réglages sans jamais croiser l'étape.
 *
 * Un layout couvre le préfixe ET toutes ses sous-routes, y compris celles qui
 * n'existent pas encore. Un test lit `PROTECTED_PREFIXES` dans `middleware.ts`
 * et exige ce fichier pour chacun : ajouter une surface de compte sans le garde
 * casse la CI.
 *
 * DEUX EXEMPTIONS, toutes deux délibérées et verrouillées par le même test :
 *   - `/onboarding` — c'est là qu'on vérifie son numéro.
 *   - `/settings`   — il héberge le panneau de vérification de SECOURS. Le
 *                     garder couperait la seule porte de sortie si le parcours
 *                     d'onboarding échoue. Exemption documentée avant cette PR,
 *                     dans `orders/page.tsx` ; on la conserve telle quelle.
 */
import type { ReactNode } from 'react';
import { exigerTelephoneVerifie } from '@/lib/auth/require-phone';

export default async function Layout({ children }: { children: ReactNode }) {
  // Retour au niveau du préfixe et non au chemin exact : le connaître
  // demanderait de faire transiter le pathname par un en-tête depuis le
  // middleware, or c'est précisément le mécanisme qui a fuité des rendus entre
  // requêtes sur Amplify. Un compte tout juste créé n'a de toute façon rien à
  // reprendre plus profond.
  await exigerTelephoneVerifie('/drafts');
  return <>{children}</>;
}
