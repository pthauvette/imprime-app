/**
 * Rate limiting via Upstash Redis (free tier, ~10k requests/jour).
 *
 * 3 buckets distincts pour les endpoints à risque :
 *   - upload: 10/min/IP  → anti-spam S3 cost (chaque presign coûte rien
 *     mais un attaquant peut générer 1000 URLs/s + upload des gros files)
 *   - signin: 5/15min/IP → anti-spam magic links vers des victims (SES
 *     quota cost + abus du nom Plio en phishing chain)
 *   - render: 30/min/IP → anti-spam PDF generation (Lambda compute cost,
 *     pdfme prend ~200ms par render)
 *
 * Si Upstash pas configuré (dev local), tout passe — pas de gate. Le rate
 * limit n'est qu'une protection production, pas une feature critique flow.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const enabled = !!(URL && TOKEN);

const redis = enabled
  ? new Redis({ url: URL!, token: TOKEN! })
  : null;

// Sliding window : plus précis qu'un fixed bucket. Si user fait 5 calls à
// 14:59:59 et 5 à 15:00:01, fixed bucket le laisse passer (deux buckets
// différents). Sliding non.
function makeLimiter(requests: number, window: `${number} ${'s' | 'm' | 'h'}`, prefix: string) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `plio:rl:${prefix}`,
    analytics: true, // Upstash dashboard montre les hits par bucket
  });
}

export const limiters = {
  upload: makeLimiter(10, '1 m', 'upload'),
  signin: makeLimiter(5, '15 m', 'signin'),
  render: makeLimiter(30, '1 m', 'render'),
  // Audit v2 #6.4 — /api/shipping/estimate proxie vers Sinalite (API payante)
  // sans auth ; on borne par IP pour éviter l'abus de coût.
  shipping: makeLimiter(20, '1 m', 'shipping'),
  // Audit v2 #6.5 — capture abandoned-cart bornée PAR EMAIL (en plus de l'IP) :
  // empêche de ré-enrôler la même victime en boucle (chaque capture reset
  // emailSentAt → re-éligible recovery → spam CASL). 5/h/email couvre le va-et-
  // vient légitime dans le wizard tout en bloquant l'abus multi-IP.
  abandonedCart: makeLimiter(5, '1 h', 'abcart'),
  // Finding [74] — « envoie-moi le lien pour continuer sur un autre appareil »
  // (/order/upload). Endpoint anonyme qui envoie un courriel à une adresse
  // arbitraire → même profil de risque qu'abandonedCart (spam d'une victime).
  // Keyé PAR EMAIL, même raisonnement : borne le ré-enrôlement répété d'une
  // même boîte, indépendamment du nombre d'IP utilisées.
  continueLink: makeLimiter(5, '1 h', 'continue-link'),
  // MCP — endpoint public (/api/mcp) dont les tools proxient Sinalite (API
  // payante, get_print_quote/estimate_shipping NON cachés). Pas d'auth sur les
  // read-only → DEUX gardes complémentaires :
  //   - mcp (60/min/IP)      : borne l'abus d'une IP donnée.
  //   - mcpGlobal (600/min)  : plafond AGRÉGÉ, keyé sur une constante. Indispensable
  //     car clientIp() lit X-Forwarded-For (spoofable) : un attaquant qui fait
  //     tourner les IP contourne le bucket-IP, mais reste borné par le plafond
  //     global → le coût Sinalite total est plafonné quoi qu'il arrive.
  mcp: makeLimiter(60, '1 m', 'mcp'),
  mcpGlobal: makeLimiter(600, '1 m', 'mcp-global'),
  // Création de clés API self-serve — keyé par USER (action authentifiée), pas IP.
  // Borne l'abus (un compromis de session ne mint pas 1000 clés).
  apiKeyMint: makeLimiter(10, '1 h', 'apikey-mint'),
  // MCP create_order Mode B (paiement headless) — keyé par USER (clé de confiance).
  // mcpOrder borne par titulaire ; mcpOrderGlobal = plafond AGRÉGÉ (anti multi-comptes :
  // empiler des clés/comptes ne multiplie pas le coût Stripe/DB). Pour une MUTATION
  // à coût Stripe, ces buckets DOIVENT être fail-CLOSED en prod (cf. create_order).
  mcpOrder: makeLimiter(10, '1 h', 'mcp-order'),
  mcpOrderGlobal: makeLimiter(60, '1 h', 'mcp-order-global'),
  // Audit pré-lancement 2026-07 (P2) — /api/orders/create, le checkout WEB, n'avait
  // AUCUNE borne, alors que son jumeau headless (mcpOrder ci-dessus) en a deux. Or
  // un appel y déclenche du travail payant AVANT tout paiement : revalidation des
  // fichiers (téléchargements S3), tarification (API Sinalite), objets Stripe.
  //
  // orderCreate est keyé par UTILISATEUR quand la session existe, sinon par IP :
  // derrière un NAT (bureau, réseau mobile) des clients légitimes distincts
  // partagent une IP, et les punir ensemble coûterait des ventes réelles.
  //
  // 60/h et non 20 : un checkout ne vaut PAS un appel. /order/review re-poste à
  // chaque code promo essayé, chaque item retiré, chaque rechargement après un
  // refus de carte — un revendeur qui traite 4 jobs le lundi matin dépasse 20
  // facilement, et ce sont les comptes les plus rentables. On borne l'emballement,
  // pas l'usage intensif.
  orderCreate: makeLimiter(60, '1 h', 'order-create'),
  // Plafond AGRÉGÉ — nécessaire car clientIp() lit X-Forwarded-For, spoofable :
  // qui fait tourner les IP échappe au bucket par-appelant.
  //
  // ⚠️ DEUX choix ici viennent d'une revue adversariale qui a démontré que la
  // première version était un interrupteur d'arrêt du chiffre d'affaires :
  //
  //   1. FENÊTRE COURTE (1 min), pas un budget horaire. Un budget horaire est un
  //      LOQUET : 300 requêtes de curl en 2 s, sans compte ni payload valide, et
  //      le checkout renvoie 429 à TOUS les clients pendant une heure pleine. Une
  //      fenêtre d'une minute borne la rafale et se rétablit seule. Même ordre de
  //      grandeur que mcpGlobal, qui garde une route moins critique.
  //   2. ANONYMES SEULEMENT (cf. orders/create). Une session valide doit TOUJOURS
  //      pouvoir payer : aucun flood anonyme ne doit pouvoir bloquer un client
  //      identifié. L'attaquant du scénario ci-dessus est anonyme, donc la borne
  //      le vise toujours.
  //
  // Le DÉBIT (60/min) est calé bas, et pas sur mcpGlobal (600/min) comme on
  // pourrait le croire : mcpGlobal garde des tools READ-ONLY, alors qu'ici chaque
  // requête coûte un appel Sinalite NON CACHÉ (getProduct, cf. sinalite/client.ts
  // « pas cacheable agressivement »), un PaymentIntent et des écritures DB. Le
  // risque dominant n'est pas la facture : c'est que Sinalite étrangle ou coupe
  // nos identifiants API, ce qui abattrait le CATALOGUE ENTIER — pas seulement le
  // checkout. Asymétrie qui décide du réglage : un seuil trop bas coûte au pire
  // 60 s de checkout anonyme lors d'un pic impossible ; un seuil trop haut coûte
  // le fournisseur. 60/min = 3600 checkouts anonymes/h, soit des dizaines de fois
  // le volume d'une journée de lancement réussie.
  //
  // RÉSIDU ASSUMÉ — il n'y a AUCUN plafond agrégé sur les appelants AUTHENTIFIÉS
  // (contrairement à mcpOrderGlobal, qui existe justement contre le multi-comptes).
  // C'est délibéré : l'y soumettre recréerait le loquet décrit plus haut sous une
  // autre forme. L'échange : une attaque anonyme, gratuite et non attribuable
  // devient une attaque authentifiée exigeant ~600 comptes avec boîtes courriel
  // livrables, chacun borné à 60/h et portant un userId bannable.
  orderCreateGlobal: makeLimiter(60, '1 m', 'order-create-global'),
  walletTopup: makeLimiter(10, '1 h', 'wallet-topup'),
  // /api/artwork — route publique qui signe des GET S3. Keyée sur une EMPREINTE
  // de la clé d'artwork (jamais la clé en clair : `analytics: true` la
  // persisterait chez Upstash, et cette clé EST le secret qui protège des
  // fichiers à PII — cf. storage/s3.ts).
  //
  // ⚠️ CE QUE CETTE BORNE NE PROTÈGE PAS : elle borne le coût S3 + signature,
  // PAS le nombre d'invocations Lambda — une clé malformée est rejetée AVANT le
  // limiteur (bon ordre : une charge d'attaque ne doit pas consommer de quota),
  // et l'invocation a déjà eu lieu. La saturation du pool de concurrence, qui
  // ferait tomber le checkout et le webhook Stripe à côté, se traite à l'edge
  // (règle WAF) ou se surveille (alarme CloudWatch). Risque ACCEPTÉ, pas couvert.
  // Prix live du configurateur — proxie vers Sinalite (API payante) SANS auth,
  // même profil de risque que `shipping`. Appelé uniquement quand la combinaison
  // manque à l'index local (produits custom_size/shapes, combos partiels), donc
  // rare en trafic normal ; 30/min laisse largement passer un client qui joue
  // avec les options.
  productPrice: makeLimiter(30, '1 m', 'product-price'),
  artwork: makeLimiter(60, '1 m', 'artwork'),
  // Plafond agrégé : `/api/uploads/presign` n'étant pas authentifiée, un
  // attaquant mint autant de clés valides qu'il veut et ouvre autant de budgets
  // de 60/min. Sans ce compagnon, le débit agrégé n'a aucune borne.
  artworkGlobal: makeLimiter(600, '1 m', 'artwork-global'),
  // Throttle des alertes de repli d'artwork : en configuration cassée, c'est une
  // alerte PAR COMMANDE. L'alerte critique se noierait dans son propre bruit au
  // moment précis où il faut la lire.
  artworkAlert: makeLimiter(1, '5 m', 'artwork-alert'),
};

/** True si le rate-limit est réellement actif (Upstash configuré). Sinon fail-open. */
export const rateLimitEnabled = enabled;

export type LimiterKey = keyof typeof limiters;

/**
 * Check le rate limit pour une key (généralement IP) sur un bucket donné.
 * Retourne soit { ok: true } pour continuer, soit { ok: false, response }
 * avec une NextResponse 429 prête à retourner.
 *
 * Usage dans une route :
 *   const ip = req.headers.get('x-forwarded-for') ?? 'anon';
 *   const limit = await rateLimit('upload', ip);
 *   if (!limit.ok) return limit.response;
 */
export async function rateLimit(
  bucket: LimiterKey,
  key: string,
): Promise<{ ok: true; remaining: number } | { ok: false; response: NextResponse }> {
  const limiter = limiters[bucket];
  // Upstash non configuré → on laisse passer (dev, ou incident Upstash en prod).
  // Ce fail-OPEN est un choix assumé pour les chemins de REVENU : une panne du
  // rate-limiter ne doit pas empêcher des clients de payer. Les chemins où le
  // risque penche dans l'autre sens (MCP create_order Mode B, paiement headless)
  // ne s'en remettent PAS à ce défaut — ils testent `rateLimitEnabled` et
  // refusent explicitement en production. Voir src/lib/mcp/place-order.ts.
  if (!limiter) return { ok: true, remaining: 999 };

  const { success, limit, remaining, reset } = await limiter.limit(key);

  if (success) return { ok: true, remaining };

  const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'Trop de requêtes — calme-toi un peu.',
        code: 'RATE_LIMITED',
        retryAfter: retryAfterSec,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(reset / 1000)),
        },
      },
    ),
  };
}

/**
 * Extract IP from Next.js request. CloudFront set x-forwarded-for, on
 * prend le premier (le vrai client, pas les proxies intermédiaires).
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'anon';
}
