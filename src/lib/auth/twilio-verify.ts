/**
 * Client Twilio Verify — envoi et vérification d'un code par SMS.
 *
 * REST direct plutôt que le SDK `twilio` (~2 Mo, des dizaines de sous-modules)
 * pour DEUX appels HTTP. Moins de surface, un cold start Lambda plus court, et
 * aucune dépendance à mettre à jour pour des raisons de sécurité.
 *
 * On ne stocke JAMAIS le code : Twilio le génère, le garde et l'expire. Plio ne
 * fait que relayer. C'est tout l'intérêt de Verify par rapport à une
 * implémentation maison — pas de code en base, pas de fenêtre d'expiration à
 * gérer, pas de comparaison à temps constant à écrire.
 *
 * INERTE SANS CONFIGURATION : sans les trois variables d'environnement, chaque
 * appel renvoie `non_configure` au lieu de lever. La connexion par SMS est une
 * OPTION ; son absence de configuration ne doit jamais casser la page de
 * connexion, dont le lien magique reste le chemin principal.
 */

import { logAuth } from '@/lib/logger';
import { masquerNumero, type E164 } from './phone';

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SERVICE = process.env.TWILIO_VERIFY_SERVICE_SID;

/** L'auth par SMS est-elle utilisable ? (config complète + drapeau actif) */
export function smsAuthDisponible(): boolean {
  return Boolean(SID && TOKEN && SERVICE && process.env.SMS_AUTH === 'ON');
}

const BASE = 'https://verify.twilio.com/v2/Services';

async function appelTwilio(
  chemin: string,
  corps: Record<string, string>,
): Promise<{ ok: true; statut: string } | { ok: false; erreur: string; code?: number }> {
  if (!SID || !TOKEN || !SERVICE) return { ok: false, erreur: 'non_configure' };

  // Twilio expire les codes tout seul ; un appel qui traîne bloquerait une
  // Lambda pour rien. 8 s couvre largement un appel Verify normal (~300 ms).
  const abort = AbortSignal.timeout(8_000);

  let res: Response;
  try {
    res = await fetch(`${BASE}/${SERVICE}${chemin}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(corps).toString(),
      signal: abort,
    });
  } catch (err) {
    // Réseau/timeout : on ne relaie PAS le détail au client (il n'en peut rien)
    // mais on le trace pour distinguer une panne Twilio d'un code erroné.
    logAuth.error({ err, chemin }, 'twilio verify : appel échoué');
    return { ok: false, erreur: 'indisponible' };
  }

  const data = (await res.json().catch(() => ({}))) as { status?: string; code?: number; message?: string };

  if (!res.ok) {
    logAuth.warn(
      { http: res.status, codeTwilio: data.code, chemin },
      'twilio verify : réponse en erreur',
    );
    return { ok: false, erreur: 'refuse', code: data.code };
  }
  return { ok: true, statut: data.status ?? 'unknown' };
}

/**
 * Déclenche l'envoi d'un code. Coûte de l'argent à CHAQUE appel — l'appelant
 * DOIT avoir appliqué la limitation de débit et la validation du pays avant.
 */
export async function envoyerCode(e164: E164) {
  const r = await appelTwilio('/Verifications', { To: e164, Channel: 'sms' });
  logAuth.info(
    { numero: masquerNumero(e164), ok: r.ok, statut: r.ok ? r.statut : r.erreur },
    'twilio verify : envoi',
  );
  return r;
}

/**
 * Vérifie un code saisi.
 *
 * Twilio borne lui-même le nombre d'essais par vérification (5 par défaut) et
 * invalide le code au-delà — on n'a donc pas à compter les échecs côté Plio.
 * `approved` est le SEUL statut qui vaut succès : `pending` signifie code
 * erroné ou expiré, et doit être traité comme un échec.
 */
export async function verifierCode(e164: E164, code: string) {
  // Un code Verify fait 6 chiffres ; tout le reste est rejeté sans appeler
  // Twilio — inutile de payer un aller-retour pour une saisie manifestement
  // invalide (et ça borne le bruit dans leur console).
  if (!/^\d{4,10}$/.test(code)) return { ok: false as const, erreur: 'code_invalide' };

  const r = await appelTwilio('/VerificationCheck', { To: e164, Code: code });
  const approuve = r.ok && r.statut === 'approved';
  logAuth.info(
    { numero: masquerNumero(e164), approuve },
    'twilio verify : vérification',
  );
  if (!r.ok) return r;
  return approuve
    ? ({ ok: true as const, statut: 'approved' })
    : ({ ok: false as const, erreur: 'code_invalide' });
}
