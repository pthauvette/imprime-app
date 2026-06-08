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
import { requireUser } from '@/lib/mcp/auth';
import { listPrintProducts, formatProductsText } from '@/lib/mcp/tools/list-products';
import {
  getProductOptions,
  getPrintQuote,
  formatProductOptionsText,
  formatQuoteText,
} from '@/lib/mcp/tools/quote';
import { estimatePrintShipping, formatShippingText } from '@/lib/mcp/tools/shipping';
import { CaProvince } from '@/lib/sinalite/types';
import { rateLimit, clientIp, rateLimitEnabled } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'list_print_products',
      "Liste les familles de produits d'impression disponibles chez Plio (cartes de visite, flyers, cartes postales, etc.) avec leurs papiers. Point de départ pour configurer une commande ou demander un devis. Aucun paramètre.",
      async () => ({
        content: [{ type: 'text', text: formatProductsText(listPrintProducts()) }],
      }),
    );

    server.tool(
      'get_product_options',
      "Pour un produit (slug de list_print_products), retourne les papiers, les finitions par papier, et les quantités disponibles. À appeler avant get_print_quote pour connaître les valeurs valides.",
      { slug: z.string().describe("Slug du produit, ex. 'cartes-de-visite'") },
      async ({ slug }) => {
        const opts = await getProductOptions(slug);
        if (!opts) {
          return { content: [{ type: 'text', text: `Produit inconnu : ${slug}. Utilise list_print_products.` }], isError: true };
        }
        return { content: [{ type: 'text', text: formatProductOptionsText(opts) }] };
      },
    );

    server.tool(
      'get_print_quote',
      "Calcule le prix CAD (taxes en sus) pour un produit + papier + finition + quantité. Le prix correspond exactement à celui du checkout. Utilise get_product_options pour les valeurs valides.",
      {
        slug: z.string().describe("Slug du produit, ex. 'cartes-de-visite'"),
        paper: z.string().describe("Clé du papier, ex. '14pt' (cf. get_product_options)"),
        finish: z.string().describe("Clé de la finition, ex. 'aq' (cf. get_product_options)"),
        quantity: z.number().int().positive().describe('Quantité voulue, ex. 500'),
      },
      async ({ slug, paper, finish, quantity }) => {
        const quote = await getPrintQuote(slug, paper, finish, quantity);
        return {
          content: [{ type: 'text', text: formatQuoteText(slug, paper, finish, quote) }],
          isError: !quote.ok,
        };
      },
    );

    server.tool(
      'estimate_shipping',
      "Estime le coût de livraison (CAD) pour un produit configuré vers une destination au Canada. Avec get_print_quote, donne le coût TOTAL (produit + port). Quantité = même valeur que le devis.",
      {
        slug: z.string().describe("Slug du produit, ex. 'cartes-de-visite'"),
        paper: z.string().describe("Clé du papier, ex. '14pt'"),
        finish: z.string().describe("Clé de la finition, ex. 'aq'"),
        quantity: z.number().int().positive().describe('Quantité, ex. 500'),
        province: CaProvince.describe('Province canadienne (2 lettres), ex. QC'),
        postalCode: z.string().describe('Code postal, ex. H2X 1Y7'),
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
    server.tool(
      'whoami',
      "Renvoie l'identité associée à la clé API fournie. Nécessite une clé API (en-tête Authorization: Bearer plio_sk_live_…).",
      {},
      async (_args, extra) => {
        const u = requireUser(extra);
        if (!u.ok) return u.error;
        return { content: [{ type: 'text', text: `Authentifié comme user ${u.userId} (rôle ${u.role}). Clé ${u.keyId}, scopes: ${u.scopes.join(', ') || '(aucun)'}.` }] };
      },
    );
  },
  {
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

// Auth par clés API (Bearer). required:false → les 4 tools read-only restent
// PUBLICS ; seuls les tools qui appellent requireUser/requireScope (whoami,
// futur create_order) exigent une clé. mcpVerifyToken est TOTAL (ne throw jamais)
// pour ne pas transformer un cold-start Neon en 401 qui casserait les read-only.
const authHandler = withMcpAuth(handler, mcpVerifyToken, { required: false });

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
  // authHandler (pas handler) : le rate-limit s'applique AVANT la vérif de clé,
  // ce qui borne aussi le coût DB de verifyApiKey (findUnique) — anti-DoS du
  // chemin d'auth.
  return authHandler(req);
}

export { gated as GET, gated as POST };
