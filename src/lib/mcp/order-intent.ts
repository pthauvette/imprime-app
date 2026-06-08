/**
 * Idempotence des commandes MCP (Mode B). Voir modèle Prisma McpOrderIntent.
 *
 * Conçu d'après une revue sécurité adversariale (workflow 8 agents) — correctifs
 * CRITICAL :
 *  - La clé d'idempotence est dérivée UNIQUEMENT de données STABLES côté serveur
 *    (nonce agent + userId + items normalisés + méthode + promo). On EXCLUT
 *    expectedTotalCents et fileUrl : instables entre deux tentatives du même
 *    achat → un retry fabriquerait une clé différente → double commande/charge.
 *  - CLAIM pessimiste (success=false) AVANT toute écriture Order/Stripe ; le
 *    gagnant unique (contrainte @@unique) crée ; un retry/concurrent tombe sur
 *    P2002 et récupère l'état du 1er (complété → on renvoie orderId+checkoutUrl ;
 *    en cours/crashé → le caller peut reprendre via l'orderId écrit au claim).
 */
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { isPrismaUniqueError } from '@/lib/db/orders';

export interface IdempKeyInput {
  /** Nonce fourni par l'agent (doit être réutilisé à l'identique sur retry). */
  idempotencyKey: string;
  userId: string;
  items: { productId: number; optionIds: number[] }[];
  shippingMethod: string;
  promoCode?: string | null;
}

/**
 * Clé d'idempotence stable (sha256 hex tronqué). Déterministe pour un même achat,
 * indépendante de expectedTotalCents/fileUrl (instables). PUR → testable.
 */
export function deriveIdempKey(input: IdempKeyInput): string {
  const canonical = JSON.stringify({
    nonce: input.idempotencyKey,
    userId: input.userId,
    // items normalisés : productId + optionIds triés, items triés par productId.
    items: input.items
      .map((i) => ({ p: i.productId, o: [...i.optionIds].sort((a, b) => a - b) }))
      .sort((a, b) => a.p - b.p || JSON.stringify(a.o).localeCompare(JSON.stringify(b.o))),
    shippingMethod: input.shippingMethod,
    promoCode: input.promoCode ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 48);
}

export type McpIntentClaim =
  | { status: 'new' }
  | { status: 'completed'; orderId: string; checkoutUrl: string | null }
  | { status: 'pending'; orderId: string | null };

/**
 * Tente le CLAIM. `new` = on a gagné (à nous de créer). `completed` = un appel
 * précédent a abouti → renvoyer son résultat (PAS de 2e commande). `pending` =
 * un appel concurrent/crashé détient le claim (le caller décide : poll/reprise).
 */
export async function claimMcpOrderIntent(userId: string, idempKey: string): Promise<McpIntentClaim> {
  try {
    await prisma.mcpOrderIntent.create({ data: { userId, idempKey, success: false } });
    return { status: 'new' };
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      const existing = await prisma.mcpOrderIntent.findUnique({
        where: { userId_idempKey: { userId, idempKey } },
        select: { success: true, orderId: true, checkoutUrl: true },
      });
      if (existing?.success && existing.orderId) {
        return { status: 'completed', orderId: existing.orderId, checkoutUrl: existing.checkoutUrl };
      }
      return { status: 'pending', orderId: existing?.orderId ?? null };
    }
    throw err;
  }
}

/** Attache l'Order au claim AVANT la Checkout Session (reprise sur crash). */
export async function attachOrderToIntent(userId: string, idempKey: string, orderId: string): Promise<void> {
  await prisma.mcpOrderIntent.update({
    where: { userId_idempKey: { userId, idempKey } },
    data: { orderId },
  });
}

/** Marque le claim comme complété (Order + Session créés). Dedup légitime au replay. */
export async function completeMcpOrderIntent(
  userId: string,
  idempKey: string,
  orderId: string,
  checkoutUrl: string,
): Promise<void> {
  await prisma.mcpOrderIntent.update({
    where: { userId_idempKey: { userId, idempKey } },
    data: { success: true, orderId, checkoutUrl },
  });
}
