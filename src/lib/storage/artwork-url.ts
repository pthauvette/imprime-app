/**
 * Indirection sur les URL d'artwork envoyées à Sinalite.
 *
 * LE PROBLÈME — `src/lib/storage/s3.ts` documente la décision d'origine : le
 * bucket est public-read parce que Sinalite télécharge l'artwork « parfois
 * plusieurs jours après le paiement », et qu'une presigned GET plafonne à 7 j
 * (limite SigV4). La sécurité repose donc entièrement sur l'imprévisibilité de
 * la clé — alors que ces fichiers peuvent contenir des PII (une carte de visite
 * porte un nom, un téléphone, une adresse).
 *
 * Le plafond de 7 j n'est pourtant qu'un symptôme. Le vrai défaut est qu'on
 * remet à un tiers une URL qu'on ne contrôle PLUS une fois émise : ni révocable,
 * ni traçable, et une suppression PIPEDA ne peut pas garantir qu'elle est morte.
 *
 * LA SOLUTION — une URL stable CHEZ NOUS (`/api/artwork/<clé>`) qui redirige
 * vers une presigned GET fabriquée AU MOMENT DE LA REQUÊTE. Le plafond de 7 j
 * disparaît (on signe à la demande), le bucket peut devenir privé, et la
 * suppression de l'objet rend l'URL morte pour de bon.
 *
 * ROLLOUT (même patron qu'ENFORCE_SHIPPING_SIG / FILE_REVALIDATION) — le mode
 * est piloté par `ARTWORK_URL_MODE`, et vaut `direct` par défaut, c'est-à-dire
 * le comportement actuel :
 *
 *   direct (défaut) : on envoie l'URL S3 publique. Inchangé.
 *   proxy           : on envoie l'URL de la route proxy.
 *
 * Pourquoi ce garde-fou et pas une bascule sèche : rien ne garantit que le
 * téléchargeur de Sinalite suive les redirections 302. S'il ne les suit pas,
 * l'artwork n'arrive jamais — commande PAYÉE et JAMAIS IMPRIMÉE, la pire panne
 * du système. La bascule doit donc être vérifiée sur une vraie commande avant
 * d'être générale, et le bucket ne peut passer en privé qu'APRÈS, une fois que
 * plus aucune commande en production ne porte d'URL directe (les payloads
 * Sinalite sont des instantanés figés à la création — cf. Order.sinalitePayload).
 */

import { s3KeyFromUrl } from './s3';
import { log } from '@/lib/logger';

/**
 * Forme EXACTE d'une clé d'artwork, telle que `buildUploadKey` la produit :
 * `uploads/{owner}/{uuid}-{kind}.{ext}`.
 *
 * SOURCE UNIQUE DE VÉRITÉ, partagée avec la route `/api/artwork`. Une revue
 * adversariale a montré ce qui arrive quand les deux côtés divergent : la
 * conversion acceptait (via `s3KeyFromUrl`, qui ne teste que le préfixe
 * `uploads/`) des clés que la route refuse. Elle produisait alors une URL proxy
 * en 404 SANS lever de repli — donc sans alerte — et la commande partait chez
 * Sinalite avec une URL morte. Payée, jamais imprimée, en silence.
 *
 * ALLOW-LIST et non deny-list : décrire ce qu'on accepte résiste aux encodages
 * exotiques, énumérer ce qu'on refuse non.
 */
export const CLE_ARTWORK_VALIDE =
  /^uploads\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}-(front|back|other)\.[a-z0-9]{1,5}$/;

export type ArtworkUrlMode = 'direct' | 'proxy';

export function artworkUrlMode(): ArtworkUrlMode {
  return process.env.ARTWORK_URL_MODE?.trim().toLowerCase() === 'proxy' ? 'proxy' : 'direct';
}

/**
 * Base publique du site, pour fabriquer une URL ABSOLUE — Sinalite appelle
 * depuis l'extérieur, une URL relative n'aurait aucun sens pour lui.
 *
 * `NEXT_PUBLIC_APP_URL` est la variable CANONIQUE du projet (env.ts, avec
 * défaut, utilisée par une vingtaine de modules dont checkout-session).
 * La version précédente lisait `AUTH_URL` (optionnelle, absente d'.env.example)
 * puis un `NEXT_PUBLIC_SITE_URL` qui n'existe NULLE PART dans le dépôt — une
 * variable fantôme. La revue adversariale a montré où ça menait : en mode
 * `proxy`, la base restait nulle, le repli silencieux réémettait des URL
 * directes, et la commande de vérification passait… en validant le chemin
 * `direct`. On en aurait conclu « Sinalite suit les 302 » sans qu'aucun 302
 * n'ait jamais été émis, avant de passer le bucket en privé.
 */
function siteBase(): string | null {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  if (!raw) return null;
  try {
    const { origin, hostname } = new URL(raw);
    // L'apex est un redirecteur GET/HEAD-only : une base dessus imposerait à
    // Sinalite DEUX sauts (301 apex → 302 presigned) au lieu d'un. On refuse
    // plutôt que de fabriquer une URL fragile.
    if (hostname === 'plio.ca') return null;
    return origin;
  } catch {
    return null;
  }
}

/** Résultat de conversion. On renvoie le MOTIF du repli plutôt que de
 *  journaliser ici : garder la fonction PURE permet à l'appelant — qui, lui,
 *  est asynchrone — d'alerter en `await`. Une alerte tirée d'ici imposerait un
 *  `void asyncFn()`, interdit côté serveur : le conteneur Lambda gèle après la
 *  réponse et la promesse est perdue. */
export interface ArtworkConversion {
  url: string;
  /** null = converti ; sinon, raison du repli sur l'URL directe. */
  fallbackReason: string | null;
}

/**
 * Convertit une URL S3 publique en URL à remettre au fournisseur. PURE.
 *
 * FAIL-OPEN ASSUMÉ : si la conversion échoue on renvoie l'URL d'origine — une
 * URL publique qui FONCTIONNE vaut mieux qu'une URL proxy cassée, l'échec ici
 * se payant en commandes payées et jamais imprimées. Mais en mode `proxy` un
 * repli est une ANOMALIE de configuration, jamais un cas nominal : le motif
 * remonte pour que l'appelant alerte (cf. reportArtworkFallbacks).
 */
export function toDeliverableUrl(publicUrl: string): ArtworkConversion {
  if (artworkUrlMode() !== 'proxy') return { url: publicUrl, fallbackReason: null };

  const key = s3KeyFromUrl(publicUrl);
  if (!key) return { url: publicUrl, fallbackReason: 'clé S3 non extractible' };
  // La MÊME forme que la route exigera. Sans ce test, une clé hors forme
  // produirait une URL proxy que /api/artwork rendrait en 404 — et le repli,
  // seul déclencheur d'alerte, ne se lèverait jamais.
  if (!CLE_ARTWORK_VALIDE.test(key)) {
    return { url: publicUrl, fallbackReason: 'clé hors forme — la route proxy la refuserait' };
  }

  const base = siteBase();
  if (!base) return { url: publicUrl, fallbackReason: 'NEXT_PUBLIC_APP_URL absente ou pointant sur l’apex' };

  // La clé contient des `/` qu'on veut GARDER comme séparateurs de chemin ;
  // seuls les segments sont encodés.
  const chemin = key.split('/').map(encodeURIComponent).join('/');
  return { url: `${base}/api/artwork/${chemin}`, fallbackReason: null };
}

/**
 * Signale les replis. À `await` depuis l'appelant (construction de payload).
 *
 * POURQUOI UNE ALERTE ET PAS UN SIMPLE LOG : un repli est INVISIBLE dans le
 * résultat — la commande part, s'imprime, tout paraît vert. Il ne se
 * découvrirait qu'au moment de passer le bucket en privé, c'est-à-dire trop
 * tard et en masse. Pire, il rend l'étape de VÉRIFICATION de la bascule
 * faussement concluante : on croirait avoir prouvé que Sinalite suit les 302
 * alors qu'aucun 302 n'aurait été émis.
 */
export async function reportArtworkFallbacks(
  reasons: (string | null)[],
  context: Record<string, unknown> = {},
): Promise<void> {
  const replis = reasons.filter((r): r is string => r !== null);
  if (replis.length === 0) return;

  // Dédupliquer et parcourir TOUS les motifs distincts. Ne garder que le premier
  // masquerait une seconde panne de nature différente survenue dans la même
  // commande — elle n'apparaîtrait nulle part et n'ouvrirait même pas son seau.
  const motifs = [...new Set(replis)];
  log.error({ ...context, motifs, replis: replis.length }, 'artwork proxy — repli sur URL directe');

  // Throttle PAR MOTIF : en configuration cassée c'est une alerte par commande,
  // et l'alerte critique se noierait dans son propre bruit au moment précis où
  // il faut la lire. Keyé sur le motif (et non globalement) pour qu'une panne
  // DIFFÉRENTE ne soit jamais avalée par la fenêtre d'une autre.
  const { rateLimit } = await import('@/lib/ratelimit');
  const { sendCriticalAlert } = await import('@/lib/alerting/slack');

  for (const motif of motifs) {
    const passe = await rateLimit('artworkAlert', motif);
    if (!passe.ok) continue;
    try {
      await sendCriticalAlert({
        severity: 'critical',
        title: 'artwork proxy — repli sur URL directe',
        body:
          `ARTWORK_URL_MODE=proxy mais la conversion échoue (${motif}).\n` +
          'Les commandes partent avec des URL S3 DIRECTES.\n' +
          '⚠️ NE PAS passer le bucket en privé tant que ce n’est pas résolu.',
        context: { ...context, motif, replis: replis.length },
      });
    } catch (err) {
      // Best-effort : le log ci-dessus est le canal de secours.
      log.error({ err, motif }, 'artwork proxy — alerte Slack non envoyée');
    }
  }
}
