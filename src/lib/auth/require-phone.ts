/**
 * Garde « téléphone vérifié obligatoire » (décision Patrick, 2026-08).
 *
 * ⚠️ PROPRIÉTÉ DE SÛRETÉ LA PLUS IMPORTANTE — le garde est INERTE tant que la
 * connexion par SMS n'est pas configurée. Sans ce repli, poser ce verrou avant
 * les variables Twilio enfermerait TOUS les comptes dehors : aucun n'a de
 * `phoneVerified`, et la page de vérification elle-même ne pourrait envoyer
 * aucun code. On refuserait l'accès sans offrir la moindre porte de sortie —
 * y compris à l'admin qui doit poser la configuration.
 *
 * Autrement dit : la fonctionnalité s'active par la CONFIGURATION, jamais par
 * le déploiement de ce code.
 *
 * Deuxième propriété : ce garde ne remplace PAS l'authentification. Sans
 * session il ne fait rien et laisse la page appliquer sa propre redirection
 * vers /sign-in — sinon un visiteur anonyme partirait vers l'écran de
 * vérification au lieu de l'écran de connexion.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { smsAuthDisponible } from './twilio-verify';

/**
 * À appeler dans un Server Component protégé, APRÈS sa propre garde de session.
 *
 * @param cheminRetour où revenir une fois le numéro vérifié — sinon
 *   l'utilisateur atterrit sur une page arbitraire et doit retrouver ce qu'il
 *   faisait.
 */
export async function exigerTelephoneVerifie(cheminRetour: string): Promise<void> {
  // Repli de sûreté (cf. en-tête) : pas de configuration → pas de verrou.
  if (!smsAuthDisponible()) return;

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  // Pas de session : ce n'est pas notre rôle, la page redirige déjà vers
  // /sign-in. Rediriger ici enverrait un anonyme vers la vérification.
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phoneVerified: true },
  });

  if (user && !user.phoneVerified) {
    // `encodeURIComponent` : le chemin de retour peut porter une query
    // (ex. /order/configure?productId=1) qui, non encodée, serait tronquée.
    redirect(`/onboarding/telephone?next=${encodeURIComponent(cheminRetour)}` as Route);
  }
}
