/**
 * POST /api/auth/sms/link — rattache un numéro VÉRIFIÉ au compte connecté.
 *
 * Sert DEUX besoins avec une seule implémentation :
 *  · l'étape téléphone de l'inscription (obligatoire, décision Patrick) ;
 *  · l'ajout d'un numéro depuis /settings par un compte existant.
 *
 * POURQUOI CE SENS-LÀ. Le lien magique fait quitter la page : vérifier le
 * téléphone AVANT le courriel obligerait à transporter la preuve entre deux
 * requêtes. Le seul support déjà en place (`plio_pending_profile`) est un
 * cookie NON SIGNÉ — acceptable pour un nom, pas pour une identité : on
 * pourrait y forger un numéro jamais vérifié et se lier à celui d'un tiers,
 * exactement la prise de contrôle qu'on veut empêcher. En rattachant APRÈS la
 * connexion, l'utilisateur prouve son numéro sur SON PROPRE compte, et il n'y
 * a plus rien à transporter.
 *
 * L'appelant DOIT avoir déjà obtenu un code via /api/auth/sms/send (qui porte
 * la limitation de débit et le filtre pays).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { normaliserNumero, messageRefus, masquerNumero } from '@/lib/auth/phone';
import { verifierCode, smsAuthDisponible } from '@/lib/auth/twilio-verify';
import { logAuth } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Corps = z.object({
  phone: z.string().min(1).max(32),
  code: z.string().min(1).max(10),
});

export async function POST(req: Request) {
  if (!smsAuthDisponible()) {
    return NextResponse.json({ error: 'Indisponible.' }, { status: 404 });
  }

  // Rattacher un numéro modifie une IDENTITÉ : la session est obligatoire.
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  }

  const parsed = Corps.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const numero = normaliserNumero(parsed.data.phone);
  if (!numero.ok) {
    return NextResponse.json({ error: messageRefus(numero.raison) }, { status: 400 });
  }

  const verif = await verifierCode(numero.e164, parsed.data.code);
  if (!verif.ok) {
    return NextResponse.json(
      { error: 'Code invalide ou expiré. Demande un nouveau code.' },
      { status: 400 },
    );
  }

  // Un numéro ne peut identifier qu'UN compte : sinon « ce numéro → ce
  // compte » serait ambigu à la connexion. On le dit explicitement plutôt que
  // de laisser remonter une violation de contrainte unique.
  const dejaPris = await prisma.user.findUnique({
    where: { phoneVerified: numero.e164 },
    select: { id: true },
  });
  if (dejaPris && dejaPris.id !== userId) {
    logAuth.warn(
      { userId, numero: masquerNumero(numero.e164) },
      'rattachement sms refusé : numéro déjà lié à un autre compte',
    );
    return NextResponse.json(
      {
        error:
          'Ce numéro est déjà rattaché à un autre compte. Connecte-toi avec ce compte, ou écris-nous à bonjour@plio.ca.',
      },
      { status: 409 },
    );
  }

  // Idempotent : re-vérifier son propre numéro rafraîchit simplement la date.
  await prisma.user.update({
    where: { id: userId },
    data: { phoneVerified: numero.e164, phoneVerifiedAt: new Date() },
  });

  logAuth.info(
    { userId, numero: masquerNumero(numero.e164) },
    'numéro rattaché et vérifié',
  );

  return NextResponse.json({ ok: true, masque: masquerNumero(numero.e164) });
}
