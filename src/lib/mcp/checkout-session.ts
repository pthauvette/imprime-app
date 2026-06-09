/**
 * Stripe Checkout Session hébergée pour une commande MCP (Mode B).
 *
 * L'agent IA ne saisit pas de carte → le MCP crée la commande PENDING + une
 * Checkout Session, et renvoie l'URL hébergée que l'HUMAIN ouvre pour payer.
 * Calqué sur /payment/retry, AVEC les correctifs de la revue :
 *  - `payment_intent_data.metadata.orderId` : c'est ce que le webhook
 *    `payment_intent.succeeded` lit en fallback pour finaliser l'Order.
 *  - `idempotencyKey` Stripe (dérivé du hash stable) : un rejeu ne crée PAS une
 *    2e Session facturable (le retry web ne l'avait pas — vecteur fermé ici).
 *  - `expires_at` court (60 min) : borne la fenêtre d'arbitrage de prix (le prix
 *    est gelé à la création ; un lien qui traîne 24h = prix périmé encaissé).
 */
import { getStripe } from '@/lib/stripe/client';

function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://www.plio.ca').replace(/\/+$/, '');
}

/** Le paiement headless est-il activé ? OFF par défaut (flag d'activation GA). */
export function isHeadlessOrderEnabled(): boolean {
  return process.env.MCP_CREATE_ORDER_PAY === '1';
}

export interface McpCheckoutInput {
  orderId: string;
  amountCents: number;
  currency: string;
  /** Email du COMPTE titulaire de la clé (jamais le contact.email fourni par l'agent). */
  customerEmail: string;
  productSummary: string;
  /** Hash d'idempotence stable (cf. deriveIdempKey) → idempotencyKey Stripe. */
  idempKey: string;
  /** Maintenant en ms (injecté pour testabilité). */
  nowMs: number;
}

/** Crée la Checkout Session et retourne son URL hébergée. Throw si Stripe n'en donne pas. */
export async function createMcpCheckoutSession(input: McpCheckoutInput): Promise<{ sessionId: string; url: string }> {
  const short = input.orderId.slice(-6).toUpperCase();
  const session = await getStripe().checkout.sessions.create(
    {
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: input.customerEmail,
      line_items: [
        {
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountCents,
            product_data: {
              name: input.productSummary || `Commande Plio #${short}`,
              description: `Commande passée via assistant IA — #${short}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { kind: 'mcp-order', orderId: input.orderId },
      // CLÉ : le webhook payment_intent.succeeded finalise via ce metadata.orderId.
      payment_intent_data: { metadata: { kind: 'mcp-order', orderId: input.orderId } },
      // Expiration courte : limite l'arbitrage de prix (prix gelé à la création).
      expires_at: Math.floor(input.nowMs / 1000) + 60 * 60,
      success_url: `${appBase()}/orders/${input.orderId}?paid=1`,
      cancel_url: `${appBase()}/orders/${input.orderId}`,
    },
    { idempotencyKey: `mcp_cs_${input.idempKey}` },
  );
  if (!session.url) {
    throw new Error('Stripe Checkout Session créée sans URL');
  }
  return { sessionId: session.id, url: session.url };
}
