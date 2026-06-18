/**
 * Serveur MCP de Plio — endpoint HTTP (Streamable HTTP) pour agents IA.
 *
 * Monté sous /api/mcp via mcp-handler ; le segment dynamique [transport] route
 * vers /api/mcp/mcp (Streamable HTTP, recommandé) ou /api/mcp/sse (legacy).
 *
 * STATELESS (pas de Redis) : chaque appel d'outil = un POST → réponse, sans
 * connexion long-vécue — choix DÉLIBÉRÉ pour AWS Amplify (Lambda), qui gèle les
 * connexions persistantes (cf. mémoire « promesses flottantes »).
 *
 * Runtime Node (pas edge) : les tools réutilisent src/lib (Prisma, Sinalite).
 *
 * Tools (tranche 1, read-only) :
 *   - list_print_products : catalogue curaté (familles + papiers). Pas d'auth.
 * À venir : get_product_options, get_print_quote, estimate_shipping (read-only),
 * puis create_order (mutation, derrière auth).
 */
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { mcpVerifyToken } from '@/lib/mcp/verify-token';
import { mcpResourceUri, isOAuthEnabled } from '@/lib/mcp/oauth-config';
import { maybeOAuthChallenge } from '@/lib/mcp/oauth-challenge';
import { requireUser, requireScope } from '@/lib/mcp/auth';
import { prepareOrderHandoff, formatOrderHandoffText } from '@/lib/mcp/tools/create-order';
import { listPrintProducts, formatProductsText } from '@/lib/mcp/tools/list-products';
import {
  getProductOptions,
  getPrintQuote,
  formatProductOptionsText,
  formatQuoteText,
} from '@/lib/mcp/tools/quote';
import { estimatePrintShipping, formatShippingText } from '@/lib/mcp/tools/shipping';
import { buildConfiguratorPayload } from '@/lib/mcp/tools/configure';
import { CONFIGURATOR_HTML } from '@/lib/mcp/widget/configurator-html.generated';
import { placeHeadlessOrder, formatHeadlessResult } from '@/lib/mcp/place-order';
import { CaProvince, ShipMethod } from '@/lib/sinalite/types';
import { rateLimit, clientIp, rateLimitEnabled } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = createMcpHandler(
  (server) => {
    // ── Widget « configurateur » (MCP Apps / ressource ui://) ───────────────────
    // Ressource HTML que le host (Claude) rend dans une iframe sandboxée ; le tool
    // configure_print ci-dessous la référence via _meta.ui.resourceUri. Le bundle
    // ext-apps est INLINÉ (CSP block-all → aucun fetch CDN possible). Présentation
    // SEULEMENT : le widget rappelle configure_print (prix live) et commande via
    // sendMessage → create_order Mode A (aucun chemin de paiement dans le widget).
    // Hôtes sans support « Apps » : _meta.ui est ignoré → le texte JSON du tool sert
    // de fallback (dégradation automatique).
    server.registerResource(
      'Configurateur Plio',
      'ui://plio/configurator.html',
      { mimeType: 'text/html;profile=mcp-app' },
      async () => ({
        contents: [{ uri: 'ui://plio/configurator.html', mimeType: 'text/html;profile=mcp-app', text: CONFIGURATOR_HTML }],
      }),
    );

    server.registerTool(
      'configure_print',
      {
        title: 'Configurateur de commande',
        description:
          "Ouvre un CONFIGURATEUR interactif (produit, papier, finition, quantité) avec prix live, rendu dans la conversation quand le client le supporte. Renvoie aussi les options + le devis en JSON (fallback). Le widget rappelle ce tool à chaque changement ; « Commander » mène au paiement sur plio.ca.",
        inputSchema: {
          slug: z.string().optional().describe('Slug produit (list_print_products). Absent → 1er produit.'),
          paper: z.string().optional().describe('Clé papier (get_product_options). Absent → 1er papier.'),
          finish: z.string().optional().describe('Clé finition. Absent → 1re finition du papier.'),
          quantity: z.number().int().positive().optional().describe('Quantité. Absent → 500 ou la 1re disponible.'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
        _meta: { ui: { resourceUri: 'ui://plio/configurator.html' } },
      },
      async ({ slug, paper, finish, quantity }) => {
        const payload = await buildConfiguratorPayload({ slug, paper, finish, quantity });
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
      },
    );

    server.registerTool(
      'list_print_products',
      {
        title: "Lister les produits d'impression",
        description:
          "Liste les familles de produits d'impression disponibles chez Plio (cartes de visite, flyers, cartes postales, etc.) avec leurs papiers. Point de départ pour configurer une commande ou demander un devis. Aucun paramètre.",
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => ({
        content: [{ type: 'text', text: formatProductsText(listPrintProducts()) }],
      }),
    );

    server.registerTool(
      'get_product_options',
      {
        title: "Options d'un produit (papiers, finitions, quantités)",
        description:
          "Pour un produit (slug de list_print_products), retourne les papiers, les finitions par papier, et les quantités disponibles. À appeler avant get_print_quote pour connaître les valeurs valides.",
        inputSchema: { slug: z.string().describe("Slug du produit, ex. 'cartes-de-visite'") },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ slug }) => {
        const opts = await getProductOptions(slug);
        if (!opts) {
          return { content: [{ type: 'text', text: `Produit inconnu : ${slug}. Utilise list_print_products.` }], isError: true };
        }
        return { content: [{ type: 'text', text: formatProductOptionsText(opts) }] };
      },
    );

    server.registerTool(
      'get_print_quote',
      {
        title: 'Obtenir un devis de prix',
        description:
          "Calcule le prix CAD (taxes en sus) pour un produit + papier + finition + quantité. Le prix correspond exactement à celui du checkout. Utilise get_product_options pour les valeurs valides.",
        inputSchema: {
          slug: z.string().describe("Slug du produit, ex. 'cartes-de-visite'"),
          paper: z.string().describe("Clé du papier, ex. '14pt' (cf. get_product_options)"),
          finish: z.string().describe("Clé de la finition, ex. 'aq' (cf. get_product_options)"),
          quantity: z.number().int().positive().describe('Quantité voulue, ex. 500'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ slug, paper, finish, quantity }) => {
        const quote = await getPrintQuote(slug, paper, finish, quantity);
        return {
          content: [{ type: 'text', text: formatQuoteText(slug, paper, finish, quote) }],
          isError: !quote.ok,
        };
      },
    );

    server.registerTool(
      'estimate_shipping',
      {
        title: 'Estimer la livraison',
        description:
          "Estime le coût de livraison (CAD) pour un produit configuré vers une destination au Canada. Avec get_print_quote, donne le coût TOTAL (produit + port). Quantité = même valeur que le devis.",
        inputSchema: {
          slug: z.string().describe("Slug du produit, ex. 'cartes-de-visite'"),
          paper: z.string().describe("Clé du papier, ex. '14pt'"),
          finish: z.string().describe("Clé de la finition, ex. 'aq'"),
          quantity: z.number().int().positive().describe('Quantité, ex. 500'),
          province: CaProvince.describe('Province canadienne (2 lettres), ex. QC'),
          postalCode: z.string().describe('Code postal, ex. H2X 1Y7'),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async ({ slug, paper, finish, quantity, province, postalCode }) => {
        const r = await estimatePrintShipping(slug, paper, finish, quantity, province, postalCode);
        return {
          content: [{ type: 'text', text: formatShippingText(slug, province, postalCode, r) }],
          isError: !r.ok,
        };
      },
    );

    // ── Tool AUTHENTIFIÉ (démo du socle d'auth) ──────────────────────────────
    // Les 4 tools ci-dessus restent PUBLICS (ils n'inspectent pas extra.authInfo).
    // whoami EXIGE une clé API valide via requireUser → preuve E2E que l'auth marche.
    server.registerTool(
      'whoami',
      {
        title: 'Identité du compte connecté',
        description:
          "Renvoie l'identité associée à la connexion (OAuth ou clé API). Nécessite d'être connecté (Bearer : JWT OAuth ou clé plio_sk_live_…).",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (_args, extra) => {
        const u = requireUser(extra);
        if (!u.ok) return u.error;
        return { content: [{ type: 'text', text: `Authentifié comme user ${u.userId} (rôle ${u.role}). Clé ${u.keyId}, scopes: ${u.scopes.join(', ') || '(aucun)'}.` }] };
      },
    );

    server.registerTool(
      'create_order',
      {
        title: "Passer une commande d'impression",
        description:
          "Passe une commande d'impression. DEUX modes : (A, défaut) sans fileUrl → renvoie un récap + un lien pour téléverser le fichier et payer sur plio.ca (scope orders:write). (B, headless) avec fileUrl sur chaque article (URL S3 Plio) + contact/livraison/expectedGrossCents/idempotencyKey → crée la commande et renvoie un lien de paiement Stripe (scope orders:write:headless, activé sur clés de confiance). Le prix et le port sont TOUJOURS recalculés côté serveur.",
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
        inputSchema: {
          items: z.array(z.object({
            slug: z.string().describe("Slug produit (list_print_products)"),
            paper: z.string().describe("Clé papier (get_product_options)"),
            finish: z.string().describe("Clé finition (get_product_options)"),
            quantity: z.number().int().positive().describe("Quantité (cf. get_product_options)"),
            fileUrl: z.string().url().optional().describe("URL S3 Plio du fichier print-ready. Présent → mode headless (scope orders:write:headless)."),
            internalRef: z.string().max(120).optional().describe("Référence interne (PO, etc.)."),
          })).min(1).max(10).describe("Articles à commander (1 à 10)"),
          // Champs du mode HEADLESS (requis seulement si fileUrl présent) :
          contact: z.object({
            firstName: z.string().min(1), lastName: z.string().min(1),
            email: z.string().email().describe("Courriel de LIVRAISON (le paiement/confirmation vont au compte de la clé)."),
            phone: z.string().min(7),
          }).optional(),
          shippingAddress: z.object({
            line1: z.string().min(1), line2: z.string().optional(),
            city: z.string().min(1), province: CaProvince, postalCode: z.string().min(3),
          }).optional(),
          shippingMethod: ShipMethod.optional().describe("Méthode (cf. estimate_shipping). Le PRIX est recalculé serveur."),
          expectedGrossCents: z.number().int().nonnegative().optional().describe("Total CAD AVANT crédits, en cents. Garde-fou anti-tamper."),
          idempotencyKey: z.string().min(8).max(64).optional().describe("Nonce stable, réutilisé À L'IDENTIQUE sur retry (évite la double commande)."),
          promoCode: z.string().max(64).optional(),
          shippingNote: z.string().max(200).optional(),
        },
      },
      async (args, extra) => {
        const headless = args.items.some((i) => i.fileUrl);
        if (headless) {
          // Mode B : scope SENSIBLE (clés de confiance only) + tous les champs requis.
          const u = requireScope(extra, 'orders:write:headless');
          if (!u.ok) return u.error;
          if (!args.items.every((i) => i.fileUrl)) {
            return { content: [{ type: 'text', text: 'Mode headless : TOUS les articles doivent avoir un fileUrl.' }], isError: true };
          }
          if (!args.contact || !args.shippingAddress || !args.shippingMethod || args.expectedGrossCents === undefined || !args.idempotencyKey) {
            return { content: [{ type: 'text', text: 'Mode headless : fournis contact, shippingAddress, shippingMethod, expectedGrossCents et idempotencyKey.' }], isError: true };
          }
          const r = await placeHeadlessOrder(
            {
              items: args.items.map((i) => ({ slug: i.slug, paper: i.paper, finish: i.finish, quantity: i.quantity, fileUrl: i.fileUrl as string, internalRef: i.internalRef })),
              contact: args.contact, shippingAddress: args.shippingAddress, shippingMethod: args.shippingMethod,
              expectedGrossCents: args.expectedGrossCents, idempotencyKey: args.idempotencyKey,
              promoCode: args.promoCode, shippingNote: args.shippingNote,
            },
            { userId: u.userId },
            Date.now(),
          );
          return { content: [{ type: 'text', text: formatHeadlessResult(r) }], isError: !r.ok };
        }
        // Mode A (défaut) : récap + lien de finalisation. Scope orders:write.
        const u = requireScope(extra, 'orders:write');
        if (!u.ok) return u.error;
        const handoff = await prepareOrderHandoff(args.items);
        return {
          content: [{ type: 'text', text: formatOrderHandoffText(handoff) }],
          isError: handoff.anyError && handoff.items.every((r) => !r.ok),
        };
      },
    );
  },
  {
    // Identité du serveur (sinon mcp-handler met « mcp-typescript server on vercel »).
    serverInfo: { name: 'plio', version: '1.0.0' },
    // ServerOptions (SDK) — instructions affichées à l'agent au handshake.
    instructions:
      "Serveur MCP de Plio, imprimerie québécoise. Permet de parcourir le catalogue d'impression, d'obtenir des devis et (bientôt) de passer commande. Tous les prix sont en CAD, taxes en sus. Commence par list_print_products. Pour les actions authentifiées, fournis une clé API dans Authorization: Bearer.",
  },
  {
    basePath: '/api/mcp',
    // verboseLogs DÉSACTIVÉ : mcp-handler pourrait sérialiser l'objet AuthInfo
    // dans ses logs verbeux ; on évite toute fuite de contexte d'auth (même si
    // AuthInfo.token ne contient plus le secret — défense en profondeur).
    verboseLogs: false,
    maxDuration: 60,
  },
);

// Auth Bearer : clés API statiques (plio_sk_) + (flag) JWT OAuth — cf. mcpVerifyToken.
// required:false → les 4 tools read-only restent PUBLICS ; seuls les tools qui
// appellent requireUser/requireScope (whoami, create_order) exigent une identité.
// mcpVerifyToken est TOTAL (ne throw jamais) pour ne pas transformer un cold-start
// Neon ou une panne JWKS en 401 qui casserait les read-only.
// resourceUrl/resourceMetadataPath FIGÉS sur la resource canonique (correctif H2) :
// le WWW-Authenticate / la métadonnée émis par mcp-handler ne dérivent plus d'un
// x-forwarded-host spoofable. La validation d'audience du token vit, elle, dans
// verifyOAuthBearer (mcpResourceUri, même source).
const authHandler = withMcpAuth(handler, mcpVerifyToken, {
  required: false,
  resourceUrl: mcpResourceUri(),
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
});

// Fail-open silencieux du rate-limit = coût Sinalite non borné. En prod, si
// Upstash est absent, on le SIGNALE au chargement (sans bloquer l'endpoint public).
if (process.env.NODE_ENV === 'production' && !rateLimitEnabled) {
  console.warn('[mcp] RATE LIMIT INACTIF en production (UPSTASH_REDIS_REST_* absent) — coût Sinalite NON borné.');
}

/**
 * Gate rate-limit (niveau HTTP, AVANT le handler MCP). Deux bornes complémentaires :
 *  - par IP (best-effort ; clientIp lit X-Forwarded-For, spoofable) ;
 *  - plafond GLOBAL agrégé → borne le coût Sinalite même si un attaquant fait
 *    tourner les IP (cf. ratelimit.ts). C'est le vrai rempart.
 * Chaque appel MCP (initialize, tools/list, tools/call) est un POST distinct
 * (stateless) → une vérif par message.
 */
async function gated(req: Request): Promise<Response> {
  const perIp = await rateLimit('mcp', clientIp(req));
  if (!perIp.ok) return perIp.response;
  const global = await rateLimit('mcpGlobal', 'all');
  if (!global.ok) return global.response;

  // Challenge OAuth (RFC 9728) — uniquement si le flag MCP_OAUTH est ON. TOUT appel
  // ANONYME (sans header Authorization) reçoit 401 + WWW-Authenticate → claude.ai /
  // ChatGPT découvrent l'AS et affichent « Connect ». C'est OBLIGATOIRE pour être
  // listé en OAuth : un serveur qui répond 200 en anonyme est classé « sans auth »
  // (donc aucun bouton Connect). Les clients qui fournissent un token (clé API ou
  // JWT) passent → mcpVerifyToken les vérifie. Flag OFF (défaut) → on saute tout ce
  // bloc → comportement byte-identique à avant (corps non lu, requête intacte,
  // serveur public/anonyme).
  if (isOAuthEnabled() && req.method === 'POST') {
    const bodyText = await req.text();
    const challenge = maybeOAuthChallenge(req, bodyText);
    if (challenge) return challenge;
    // Corps déjà consommé par .text() → on reconstruit la requête pour le handler
    // (mêmes headers + corps bufferisé) ; le handler MCP relit le JSON-RPC.
    return authHandler(new Request(req.url, { method: 'POST', headers: req.headers, body: bodyText }));
  }

  // authHandler (pas handler) : le rate-limit s'applique AVANT la vérif de clé,
  // ce qui borne aussi le coût DB de verifyApiKey (findUnique) — anti-DoS du
  // chemin d'auth.
  return authHandler(req);
}

export { gated as GET, gated as POST };
