/**
 * Helpers DB pour les Orders.
 *
 * Centralise la logique de transition d'état pour éviter que chaque route
 * réinvente la roue. Toute mutation passe par ici → audit trail garanti
 * via OrderEvent.
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { SinaliteOrderRequest } from '@/lib/sinalite/types';
import { logWebhook } from '@/lib/logger';

// ─── ENUM-LIKE ────────────────────────────────────────────────────────────
// SQLite n'a pas d'enums — on contraint via TypeScript.

export const ORDER_STATUS = [
  'PENDING',
  'PAID',
  'SUBMITTED',
  'IN_PRODUCTION',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

export const ORDER_EVENT_KIND = [
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'SINALITE_SUBMITTED',
  'SINALITE_STATUS_CHANGED',
  'REFUND_ISSUED',
  'ERROR',
] as const;
export type OrderEventKind = (typeof ORDER_EVENT_KIND)[number];

// ─── USER ─────────────────────────────────────────────────────────────────

export async function findOrCreateUserByEmail(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}) {
  const email = input.email.toLowerCase().trim();
  return prisma.user.upsert({
    where: { email },
    create: {
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    },
    // Don't overwrite filled fields with empty ones — only patch what's missing
    update: {
      firstName: input.firstName ?? undefined,
      lastName: input.lastName ?? undefined,
      phone: input.phone ?? undefined,
    },
  });
}

// ─── ORDER CREATE ─────────────────────────────────────────────────────────
// Appelé par /api/orders/create AVANT que Stripe ait confirmé. Statut = PENDING.
// Webhook Stripe transitionera vers PAID → SUBMITTED après.

export type CreateOrderInput = {
  userId: string;
  paymentIntentId: string;
  amountCents: number;
  itemsCount: number;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  shippingMethod: string;
  province: string;
  shipName: string;
  shipLine1: string;
  shipLine2?: string;
  shipCity: string;
  shipProvince: string;
  shipPostalCode: string;
  shipPhone: string;
  sinalitePayload: SinaliteOrderRequest;
  /** Human-readable product summary for emails + admin without refetching Sinalite. */
  productSummary?: string;
  /** Promo code applied (optional). Si présent on incrémente usesCount atomiquement. */
  promoCodeId?: string;
  /** Discount applied in cents. 0 si pas de promo. */
  discountCents?: number;
};

export async function createPendingOrder(input: CreateOrderInput) {
  // Si promo : on wrap dans une tx pour incrémenter usesCount + créer l'order
  // atomiquement. Sinon créer direct.
  const orderData = {
    userId: input.userId,
    paymentIntentId: input.paymentIntentId,
    amountCents: input.amountCents,
    status: 'PENDING',
    sinalitePayload: JSON.stringify(input.sinalitePayload),
    productSummary: input.productSummary,
    itemsCount: input.itemsCount,
    subtotalCents: input.subtotalCents,
    shippingCents: input.shippingCents,
    taxCents: input.taxCents,
    discountCents: input.discountCents ?? 0,
    promoCodeId: input.promoCodeId ?? null,
    shippingMethod: input.shippingMethod,
    province: input.province,
    shipName: input.shipName,
    shipLine1: input.shipLine1,
    shipLine2: input.shipLine2,
    shipCity: input.shipCity,
    shipProvince: input.shipProvince,
    shipPostalCode: input.shipPostalCode,
    shipPhone: input.shipPhone,
  };

  if (input.promoCodeId) {
    const [, order] = await prisma.$transaction([
      prisma.promoCode.update({
        where: { id: input.promoCodeId },
        data: { usesCount: { increment: 1 } },
      }),
      prisma.order.create({ data: orderData }),
    ]);
    return order;
  }
  return prisma.order.create({ data: orderData });
}

// ─── ORDER TRANSITIONS ────────────────────────────────────────────────────
// Toujours append-only sur OrderEvent — l'historique de statut sert pour
// le debug + le timeline UI plus tard.

export async function markOrderPaid(paymentIntentId: string) {
  const order = await prisma.order.findUnique({ where: { paymentIntentId } });
  if (!order) throw new OrderNotFoundError(paymentIntentId);

  return prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    }),
    prisma.orderEvent.create({
      data: { orderId: order.id, kind: 'PAYMENT_SUCCEEDED' },
    }),
  ]);
}

export async function markOrderSubmitted(input: {
  orderId: string;
  sinaliteOrderId: number;
}) {
  return prisma.$transaction([
    prisma.order.update({
      where: { id: input.orderId },
      data: {
        status: 'SUBMITTED',
        sinaliteOrderId: String(input.sinaliteOrderId),
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: input.orderId,
        kind: 'SINALITE_SUBMITTED',
        data: JSON.stringify({ sinaliteOrderId: input.sinaliteOrderId }),
      },
    }),
  ]);
}

export async function markOrderFailed(input: {
  orderId: string;
  reason: string;
  data?: unknown;
}) {
  return prisma.$transaction([
    prisma.order.update({
      where: { id: input.orderId },
      data: { status: 'FAILED', failureReason: input.reason.slice(0, 500) },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: input.orderId,
        kind: 'ERROR',
        data: input.data ? JSON.stringify(input.data).slice(0, 2000) : null,
      },
    }),
  ]);
}

export async function markRefundIssued(input: {
  orderId: string;
  refundId: string;
}) {
  return prisma.orderEvent.create({
    data: {
      orderId: input.orderId,
      kind: 'REFUND_ISSUED',
      data: JSON.stringify({ refundId: input.refundId }),
    },
  });
}

/** Mapping des status Sinalite (NEW/IN_PRODUCTION/SHIPPED/...) → nos status DB. */
const SINALITE_TO_DB_STATUS = {
  NEW: 'SUBMITTED',
  IN_PRODUCTION: 'IN_PRODUCTION',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const satisfies Record<string, OrderStatus>;

export type SinaliteStatus = keyof typeof SINALITE_TO_DB_STATUS;

export async function applySinaliteStatusChange(input: {
  sinaliteOrderId: number;
  status: SinaliteStatus;
  data: unknown;
}) {
  const order = await prisma.order.findUnique({
    where: { sinaliteOrderId: String(input.sinaliteOrderId) },
  });
  if (!order) throw new OrderNotFoundError(`sinalite=${input.sinaliteOrderId}`);

  const nextStatus = SINALITE_TO_DB_STATUS[input.status];
  return prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: nextStatus },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'SINALITE_STATUS_CHANGED',
        data: JSON.stringify(input.data).slice(0, 2000),
      },
    }),
  ]);
}

// ─── QUERIES ──────────────────────────────────────────────────────────────

export async function listOrdersForUser(input: { userId?: string; limit?: number }) {
  return prisma.order.findMany({
    where: input.userId ? { userId: input.userId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: input.limit ?? 50,
    include: { user: { select: { email: true, firstName: true, lastName: true } } },
  });
}

export async function getOrderById(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      user: true,
      events: { orderBy: { createdAt: 'asc' } },
    },
  });
}

// ─── WEBHOOK IDEMPOTENCE + OUTCOME TRACKING ──────────────────────────────
// Pattern handler :
//   const start = Date.now();
//   const { isNew } = await recordWebhookEvent({ source, eventId, eventType });
//   if (!isNew) return NextResponse.json({ deduped: true });
//   try {
//     // ... do work, get orderId once known ...
//     await updateWebhookOutcome({ source, eventId, success: true,
//       statusCode: 200, latencyMs: Date.now() - start, orderId });
//     return NextResponse.json({ received: true });
//   } catch (err) {
//     await updateWebhookOutcome({ source, eventId, success: false,
//       statusCode: 500, latencyMs: Date.now() - start, error: err.message });
//     throw err;
//   }
//
// recordWebhookEvent insert la row (idempotence). updateWebhookOutcome
// la patch en fin de handler avec le résultat réel. updateWebhookOutcome
// est best-effort : si la row n'existe pas (race), on no-op silencieusement
// plutôt que de masquer l'erreur métier du handler.

export type WebhookSource = 'STRIPE' | 'SINALITE';

export async function recordWebhookEvent(input: {
  source: WebhookSource;
  eventId: string;
  eventType: string;
}): Promise<{ isNew: boolean }> {
  try {
    await prisma.webhookEvent.create({ data: input });
    return { isNew: true };
  } catch (err) {
    // Unique violation (P2002) = déjà processed
    if (isPrismaUniqueError(err)) return { isNew: false };
    throw err;
  }
}

/**
 * Patch la row WebhookEvent existante (créée par recordWebhookEvent) avec
 * le résultat final du handler. À appeler dans le finally / catch du
 * handler. Best-effort : on swallow les erreurs de DB pour ne pas masquer
 * l'erreur métier originale.
 */
export async function updateWebhookOutcome(input: {
  source: WebhookSource;
  eventId: string;
  success: boolean;
  statusCode: number;
  latencyMs: number;
  error?: string;
  orderId?: string;
}): Promise<void> {
  try {
    await prisma.webhookEvent.update({
      where: { source_eventId: { source: input.source, eventId: input.eventId } },
      data: {
        success: input.success,
        statusCode: input.statusCode,
        latencyMs: input.latencyMs,
        error: input.error ? input.error.slice(0, 500) : null,
        ...(input.orderId ? { orderId: input.orderId } : {}),
      },
    });
  } catch (err) {
    // Race ou row absente — on ne veut pas masquer l'erreur originale du handler.
    logWebhook.error(
      { err, source: input.source, eventId: input.eventId },
      'outcome update failed',
    );
  }
}

/**
 * INSERT-or-IGNORE pour les cas où on veut enregistrer un outcome sans
 * passer par le pattern recordWebhookEvent → updateWebhookOutcome (e.g.
 * pour backfiller ou pour des handlers qui n'ont pas besoin de dedupe
 * upfront). Si la row existe déjà, on ne touche à rien.
 */
export async function recordWebhookOutcome(input: {
  source: WebhookSource;
  eventId: string;
  eventType: string;
  success: boolean;
  statusCode: number;
  latencyMs: number;
  error?: string;
  orderId?: string;
}): Promise<{ isNew: boolean }> {
  try {
    await prisma.webhookEvent.create({
      data: {
        source: input.source,
        eventId: input.eventId,
        eventType: input.eventType,
        success: input.success,
        statusCode: input.statusCode,
        latencyMs: input.latencyMs,
        error: input.error ? input.error.slice(0, 500) : null,
        orderId: input.orderId,
      },
    });
    return { isNew: true };
  } catch (err) {
    if (isPrismaUniqueError(err)) return { isNew: false };
    throw err;
  }
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

// ─── ERRORS ───────────────────────────────────────────────────────────────

export class OrderNotFoundError extends Error {
  constructor(key: string) {
    super(`Order not found: ${key}`);
    this.name = 'OrderNotFoundError';
  }
}

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { user: true; events: true };
}>;
