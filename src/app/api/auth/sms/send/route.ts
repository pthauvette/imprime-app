/**
 * POST /api/auth/sms/send — déclenche l'envoi d'un code de vérification.
 *
 * Endpoint ANONYME et PAYANT : chaque appel réussi coûte un SMS. C'est le
 * profil de risque exact de la fraude au « pompage SMS », d'où les gardes
 * ci-dessous, appliquées AVANT tout appel à Twilio.
 *
 * Ordre volontaire des vérifications — du moins cher au plus cher :
 *   1. fonctionnalité active           (aucun I/O)
 *   2. limiteur réellement opérant     (aucun I/O)
 *   3. numéro valide ET canadien       (aucun I/O — écarte l'essentiel du pompage)
 *   4. limitation de débit             (Redis)
 *   5. envoi Twilio                    (facturé)
 * Un numéro hors Canada ne doit même pas consommer un jeton de limitation :
 * sinon un attaquant épuise les compteurs des vrais clients avec des numéros
 * qu'on n'aurait de toute façon jamais servis.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit, rateLimitEnabled, clientIp } from '@/lib/ratelimit';
import { normaliserNumero, messageRefus, masquerNumero } from '@/lib/auth/phone';
import { envoyerCode, smsAuthDisponible } from '@/lib/auth/twilio-verify';
import { logAuth } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Corps = z.object({ phone: z.string().min(1).max(32) });

export async function POST(req: Request) {
  if (!smsAuthDisponible()) {
    // 404 plutôt que 503 : tant que la fonctionnalité n'est pas configurée,
    // elle n'existe pas du point de vue du client. Rien à sonder.
    return NextResponse.json({ error: 'Indisponible.' }, { status: 404 });
  }

  // FAIL-CLOSED, contrairement au défaut de `rateLimit`.
  //
  // `rateLimit()` laisse PASSER quand Upstash n'est pas configuré — choix
  // assumé pour les chemins de revenu (une panne du limiteur ne doit pas
  // empêcher un client de payer). Ici le risque penche dans l'autre sens :
  // sans limiteur, cet endpoint est une facture ouverte. Même raisonnement
  // que MCP create_order Mode B, qui refuse aussi explicitement.
  if (!rateLimitEnabled) {
    logAuth.error(
      {},
      'sms/send refusé : limiteur de débit inerte (UPSTASH_* absentes) — endpoint payant',
    );
    return NextResponse.json(
      { error: 'La connexion par texto est temporairement indisponible. Utilise le lien par courriel.' },
      { status: 503 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Corps.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: messageRefus('vide') }, { status: 400 });
  }

  const numero = normaliserNumero(parsed.data.phone);
  if (!numero.ok) {
    // Refus AVANT de consommer un jeton de limitation (cf. en-tête).
    return NextResponse.json({ error: messageRefus(numero.raison) }, { status: 400 });
  }

  // Par numéro : empêche de harceler une même victime de codes, quel que soit
  // le nombre d'IP utilisées.
  const parNumero = await rateLimit('smsSend', numero.e164);
  if (!parNumero.ok) return parNumero.response;

  // Par IP : borne l'énumération de numéros depuis un même poste.
  const parIp = await rateLimit('smsSendIp', clientIp(req));
  if (!parIp.ok) return parIp.response;

  // Plafond AGRÉGÉ : les deux bornes ci-dessus se contournent en faisant tourner
  // IP et numéros. Celle-ci borne la FACTURE quoi qu'il arrive.
  const global = await rateLimit('smsSendGlobal', 'sms');
  if (!global.ok) {
    logAuth.error({}, 'sms/send : plafond global atteint — abus probable');
    return global.response;
  }

  const envoi = await envoyerCode(numero.e164);
  if (!envoi.ok) {
    return NextResponse.json(
      { error: 'Impossible d’envoyer le code pour l’instant. Réessaie dans un instant.' },
      { status: 502 },
    );
  }

  // On renvoie le numéro MASQUÉ pour que l'écran suivant puisse afficher
  // « code envoyé au ••• ••• 0123 » sans que le client ait à s'en souvenir —
  // et sans qu'un numéro complet transite dans une réponse mise en cache.
  return NextResponse.json({ ok: true, masque: masquerNumero(numero.e164) });
}
