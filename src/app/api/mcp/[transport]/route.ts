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
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { listPrintProducts, formatProductsText } from '@/lib/mcp/tools/list-products';
import {
  getProductOptions,
  getPrintQuote,
  formatProductOptionsText,
  formatQuoteText,
} from '@/lib/mcp/tools/quote';

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
  },
  {
    // ServerOptions (SDK) — instructions affichées à l'agent au handshake.
    instructions:
      "Serveur MCP de Plio, imprimerie québécoise. Permet de parcourir le catalogue d'impression et (bientôt) d'obtenir des devis et passer commande. Tous les prix sont en CAD, taxes en sus. Commence par list_print_products.",
  },
  {
    basePath: '/api/mcp',
    verboseLogs: process.env.NODE_ENV !== 'production',
    maxDuration: 60,
  },
);

export { handler as GET, handler as POST };
