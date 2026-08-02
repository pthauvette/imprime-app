/**
 * Logique de connexion par code SMS, extraite du provider NextAuth.
 *
 * Séparée pour être TESTABLE : enfouie dans le tableau `providers` de
 * `auth.ts`, elle n'aurait pu être exercée qu'en montant tout NextAuth. Or
 * c'est du code qui décide « ce numéro ouvre-t-il cette session » — il mérite
 * des tests directs, pas une couverture indirecte.
 */

import { prisma } from '@/lib/db';
import { logAuth } from '@/lib/logger';
import { normaliserNumero, masquerNumero } from './phone';
import { verifierCode, smsAuthDisponible } from './twilio-verify';

/** Ce que NextAuth attend d'un `authorize` réussi. */
export interface UtilisateurSession {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

/**
 * Valide un couple (numéro, code) et renvoie le compte à ouvrir, ou `null`.
 *
 * CONNEXION UNIQUEMENT — ne crée JAMAIS de compte. Un compte exige un
 * `phoneVerified` déjà rattaché, c.-à-d. un numéro prouvé lors d'une
 * inscription (courriel + téléphone). Créer ici ouvrirait un compte sans
 * courriel vérifié et contournerait le modèle d'identité.
 *
 * Tous les échecs renvoient `null`, sans distinction : numéro invalide, code
 * erroné et numéro sans compte sont indiscernables de l'extérieur. Sinon
 * l'endpoint devient un oracle « ce numéro a-t-il un compte chez Plio ? ».
 */
export async function connexionParSms(
  telephone: unknown,
  code: unknown,
): Promise<UtilisateurSession | null> {
  if (!smsAuthDisponible()) return null;

  const numero = normaliserNumero(String(telephone ?? ''));
  if (!numero.ok) return null;

  // Twilio borne lui-même les essais par vérification (5, puis le code est
  // invalidé) : inutile de recompter côté Plio.
  const verif = await verifierCode(numero.e164, String(code ?? ''));
  if (!verif.ok) return null;

  // Le code est bon — reste à savoir à QUI ce numéro appartient.
  // `phoneVerified`, jamais `phone` : seul un numéro prouvé fait identité
  // (le second est saisi librement au checkout). Cf. schema.prisma.
  const user = await prisma.user.findUnique({
    where: { phoneVerified: numero.e164 },
    select: { id: true, email: true, name: true, image: true },
  });

  if (!user) {
    // Code valide, mais aucun compte rattaché. Tracé (numéro MASQUÉ) pour que
    // le support distingue ce cas d'un code erroné ; côté client, même échec.
    logAuth.warn(
      { numero: masquerNumero(numero.e164) },
      'connexion sms : code valide mais aucun compte rattaché',
    );
    return null;
  }

  logAuth.info({ userId: user.id }, 'connexion sms réussie');
  return user;
}
