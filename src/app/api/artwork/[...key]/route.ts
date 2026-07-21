/**
 * GET /api/artwork/<clé S3> — URL STABLE d'artwork, sous notre contrôle.
 *
 * Remplace la remise directe d'une URL S3 publique à Sinalite. Voir
 * `src/lib/storage/artwork-url.ts` pour le raisonnement complet ; en résumé :
 * une URL publique remise à un tiers n'est ni révocable, ni traçable, et une
 * suppression PIPEDA ne peut pas garantir qu'elle est morte.
 *
 * REDIRECTION, PAS STREAMING — la route répond 302 vers une presigned GET
 * fabriquée à l'instant, elle ne relaie PAS les octets. C'est délibéré : les
 * fichiers print pèsent 20 à 100 Mo (150 max) et le module d'upload a été conçu
 * pour qu'ils ne traversent JAMAIS Lambda (bande passante, taille de réponse,
 * timeout 15 min). Les faire transiter ici annulerait cette propriété.
 *
 * ── SURFACE EXPOSÉE (revue adversariale) ──────────────────────────────────
 * Cette route est publique dès le déploiement, INDÉPENDAMMENT d'ARTWORK_URL_MODE
 * (le flag ne pilote que la forme des URL émises, pas l'existence de la route).
 * C'est assumé, et sûr, à UNE condition : elle ne doit jamais pouvoir signer
 * autre chose que les objets DÉJÀ publics aujourd'hui. D'où l'allow-list de
 * forme ci-dessous, qui n'accepte que la clé exacte produite par
 * `buildUploadKey`. Sous cette contrainte, la route n'ouvre rien de neuf : elle
 * donne accès, via une signature courte, à ce qui est aujourd'hui en `public-read`.
 *
 * On ne gate PAS la route sur ARTWORK_URL_MODE, volontairement : les payloads
 * Sinalite sont figés à la création de commande, donc un retour `proxy → direct`
 * doit laisser vivantes les URL déjà émises. Gater ici tuerait ces commandes —
 * « payée, jamais imprimée ».
 */

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client, S3_BUCKET } from '@/lib/storage/s3';
import { rateLimit } from '@/lib/ratelimit';
import { CLE_ARTWORK_VALIDE } from '@/lib/storage/artwork-url';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** TTL de la presigned GET. Courte : elle n'a qu'à survivre au saut de
 *  redirection, pas à la production. C'est tout l'intérêt de signer à la demande
 *  — c'est ce qui fait disparaître le plafond SigV4 de 7 j. */
const PRESIGN_TTL_SECONDS = 15 * 60;


export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await ctx.params;
  // PAS de decodeURIComponent : Next décode déjà les paramètres de route. Le
  // second décodage ÉTAIT la faille — il rouvrait ce que la validation venait
  // de fermer.
  const key = segments.join('/');

  // Forme validée par la MÊME regex que la conversion (source unique) : les
  // deux côtés ne peuvent plus diverger sans que le compilateur s'en aperçoive.
  if (!CLE_ARTWORK_VALIDE.test(key)) {
    // 404 muet : ne renseigne pas sur ce qui existe.
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  }

  // Borne dérivée de la CLÉ D'ARTWORK, pas de l'IP — et sur une EMPREINTE, pas
  // sur la clé elle-même. Deux décisions distinctes, issues de la revue :
  //
  //   1. Pourquoi pas l'IP : `clientIp()` lit X-Forwarded-For, que le client
  //      contrôle. Un attaquant fait tourner l'en-tête et n'atteint jamais la
  //      borne ; Sinalite, lui, sort d'UNE IP honnête — la borne par IP visait
  //      donc exactement le mauvais acteur. La clé, dérivée du chemin, n'est pas
  //      usurpable : Sinalite tirant 500 fichiers DISTINCTS passe toujours,
  //      marteler UN objet est coupé.
  //
  //   2. Pourquoi une empreinte : `makeLimiter` pose `analytics: true`, et
  //      @upstash/ratelimit persiste l'identifiant BRUT pour son tableau de bord.
  //      Or `storage/s3.ts` énonce que « la sécurité repose ENTIÈREMENT sur
  //      l'imprévisibilité de la clé » et que ces fichiers PEUVENT contenir des
  //      PII. Passer la clé en clair recopierait LE SECRET LUI-MÊME — plus le
  //      userId du segment owner — dans un SaaS tiers, hors juridiction. Le hash
  //      conserve toutes les propriétés du compteur (déterministe, un seau par
  //      objet) sans rien divulguer.
  const empreinte = createHash('sha256').update(key).digest('base64url').slice(0, 32);
  const limite = await rateLimit('artwork', empreinte);
  if (!limite.ok) return limite.response;

  // Plafond AGRÉGÉ — convention maison (cf. mcpGlobal, mcpOrderGlobal,
  // orderCreateGlobal). Indispensable ici car la borne par clé se contourne
  // en… changeant de clé : `/api/uploads/presign` n'est pas authentifiée, donc
  // un attaquant mint N clés valides et ouvre N budgets de 60/min. Fenêtre
  // courte (1 min) et non budget horaire : un budget long serait un loquet.
  const plafond = await rateLimit('artworkGlobal', 'all');
  if (!plafond.ok) return plafond.response;

  if (!S3_BUCKET) {
    log.error('artwork proxy — S3_BUCKET absent du runtime');
    return NextResponse.json({ error: 'Stockage non configuré' }, { status: 503 });
  }

  const client = getS3Client();

  // HEAD d'abord : un objet supprimé (purge PIPEDA, cycle de vie) doit rendre
  // l'URL MORTE. C'est précisément ce que le bucket public-read ne pouvait pas
  // offrir. Sans ce contrôle on signerait une clé absente, et l'appelant
  // recevrait un 403 S3 opaque au lieu d'un 404 franc.
  try {
    await client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch {
    return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  }

  let url: string;
  try {
    url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
  } catch (err) {
    log.error({ err, key }, 'artwork proxy — signature GET échouée');
    return NextResponse.json({ error: 'Indisponible' }, { status: 502 });
  }

  // 302 et non 301 : la cible est signée et éphémère ; la mettre en cache
  // définitivement livrerait une URL expirée à la requête suivante.
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
