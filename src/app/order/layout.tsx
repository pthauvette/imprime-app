/**
 * Layout pour /order/* — toutes les étapes du wizard.
 *
 * Ajoute le FloatingHelpButton (bouton "Besoin d'aide ?" persistant)
 * sur chaque page du wizard. Préfille email + nom si user connecté pour
 * que l'envoi soit en 1 click.
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import FloatingHelpButton from '@/components/support/FloatingHelpButton';

export default async function OrderLayout({ children }: { children: React.ReactNode }) {
  // Fetch session côté server pour préremplir le help modal. Best-effort :
  // si la query DB fail (rare), on passe des defaults vides — le user
  // taperait ses infos manuellement.
  let defaultName = '';
  let defaultEmail = '';
  try {
    const session = await auth();
    if (session?.user?.id) {
      defaultEmail = session.user.email ?? '';
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { firstName: true, lastName: true, name: true },
      });
      defaultName = user?.name ?? [user?.firstName, user?.lastName].filter(Boolean).join(' ') ?? '';
    }
  } catch {
    // Best effort — pas d'auth, modal demandera les infos.
  }

  return (
    <>
      {children}
      <FloatingHelpButton defaultName={defaultName} defaultEmail={defaultEmail} />
    </>
  );
}
