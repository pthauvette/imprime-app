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
import { listPrintProducts, formatProductsText } from '@/lib/mcp/tools/list-products';

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
