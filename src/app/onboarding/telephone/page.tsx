/**
 * /onboarding/telephone — étape téléphone obligatoire après la première
 * connexion (décision Patrick : courriel ET téléphone vérifiés).
 *
 * Cette page N'EST VOLONTAIREMENT PAS protégée par `exigerTelephoneVerifie` :
 * c'est la sortie du verrou. L'y appliquer créerait une boucle de redirection
 * infinie — le garde renverrait ici quelqu'un qui s'y trouve déjà.
 *
 * Elle reste en revanche protégée par la SESSION : rattacher un numéro modifie
 * une identité, donc il faut savoir laquelle.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { safeInternalPath } from '@/lib/auth/safe-redirect';
import { smsAuthDisponible } from '@/lib/auth/twilio-verify';
import PhoneOnboardingClient from '@/components/account/PhoneOnboardingClient';

export const metadata = { title: 'Vérifie ton téléphone' };
export const dynamic = 'force-dynamic';

export default async function PageTelephone({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Même raisonnement qu'au sign-in : `next` vient de l'URL, donc non fiable.
  // Sans validation, /onboarding/telephone?next=https://evil.com redirigerait
  // hors-site après vérification (open-redirect → hameçonnage).
  const retour = safeInternalPath(next);

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(retour)}` as Route);
  }

  // Fonctionnalité non configurée : cette page n'a plus de raison d'exister et
  // ne pourrait envoyer aucun code. On renvoie l'utilisateur d'où il venait
  // plutôt que de l'immobiliser devant un formulaire inopérant.
  if (!smsAuthDisponible()) redirect(retour as Route);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phoneVerified: true },
  });

  // Déjà vérifié (p. ex. arrivée par un lien direct, ou second onglet) : rien
  // à faire ici.
  if (user?.phoneVerified) redirect(retour as Route);

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '64px 24px 96px' }}>
      <div className="page-eyebrow">Dernière étape</div>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(32px, 5vw, 44px)',
          letterSpacing: '-0.02em',
          fontWeight: 400,
          lineHeight: 1.1,
          margin: '8px 0 16px',
        }}
      >
        Vérifie ton <em style={{ color: 'var(--accent-primary)' }}>téléphone.</em>
      </h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 32px' }}>
        On confirme ton numéro par un code texto. Ça sécurise ton compte et te
        permet ensuite de te connecter sans courriel.
      </p>

      <PhoneOnboardingClient retour={retour} />

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 24, lineHeight: 1.5 }}>
        Pas de mobile canadien ? Écris-nous à{' '}
        <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>
          bonjour@plio.ca
        </a>{' '}
        — on débloque ton compte manuellement.
      </p>
    </main>
  );
}
