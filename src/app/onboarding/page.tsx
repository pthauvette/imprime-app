/**
 * /onboarding — DEPRECATED.
 *
 * Cette page était un lift-and-shift HTML statique avec des liens
 * `*.html` qui 404aient. Le vrai onboarding est le composant
 * <OnboardingTour /> monté dans `src/app/page.tsx` qui s'affiche en modal
 * sur les premières visites (cookie plio_tour).
 *
 * On redirige vers la home — le modal d'onboarding va naturellement
 * apparaître pour les nouveaux visiteurs.
 */

import { redirect } from 'next/navigation';

export const metadata = { title: 'Plio' };

export default function OnboardingPage() {
  redirect('/');
}
