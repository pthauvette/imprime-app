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
import { composeName } from '@/lib/account/profile';

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
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });

  if (!existing) {
    // Nouveau compte (guest checkout) : pose le profil + le `name` composite.
    return prisma.user.create({
      data: {
        email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        phone: input.phone ?? null,
        name: composeName(input.firstName, input.lastName),
      },
    });
  }

  // Compte EXISTANT (le courriel de livraison matche un compte). Audit v3 M4/L5 :
  // on ne remplit QUE les champs manquants — jamais d'écrasement d'une identité
  // déjà saisie par le contact d'une commande — et on recalcule `name` depuis les
  // valeurs finales (avant : `?? undefined` écrasait quand l'input était fourni,
  // et `name` restait périmé). Source unique du compose : composeName.
  const firstName = existing.firstName ?? input.firstName ?? null;
  const lastName = existing.lastName ?? input.lastName ?? null;
  const phone = existing.phone ?? input.phone ?? null;
  return prisma.user.update({
    where: { id: existing.id },
    data: { firstName, lastName, phone, name: composeName(firstName, lastName) },
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
  /** Round 26 #2 — instructions livraison customer-fournies. NULL = aucune. */
  shippingNote?: string | null;
  sinalitePayload: SinaliteOrderRequest;
  /** Human-readable product summary for emails + admin without refetching Sinalite. */
  productSummary?: string;
  /** Snapshot itemized pour /orders UI (Phase 2 multi-item). Array de
   *  DisplayItem, serialisé en JSON string ici. */
  itemsSnapshot?: unknown[];
  /** Promo code applied (optional). Si présent on incrémente usesCount atomiquement. */
  promoCodeId?: string;
  /** Discount applied in cents. 0 si pas de promo. */
  discountCents?: number;
  /** Crédit parrainage déduit (cents). 0 si pas applicable. */
  referralCreditAppliedCents?: number;
  /** Round 20 #3 — Wallet prepaid credit déduit (cents). 0 si pas applicable.
   *  Le débit effectif du wallet se fait dans le webhook Stripe payment_intent.succeeded
   *  (atomique avec mark order PAID) — pas ici (PENDING peut être annulé). */
  walletCreditAppliedCents?: number;
  /** Round 22 #2 — Reseller 5% discount snapshot. 0 si pas VERIFIED. */
  resellerDiscountCents?: number;
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
    itemsSnapshot: input.itemsSnapshot ? JSON.stringify(input.itemsSnapshot) : null,
    itemsCount: input.itemsCount,
    subtotalCents: input.subtotalCents,
    shippingCents: input.shippingCents,
    taxCents: input.taxCents,
    discountCents: input.discountCents ?? 0,
    referralCreditAppliedCents: input.referralCreditAppliedCents ?? 0,
    walletCreditAppliedCents: input.walletCreditAppliedCents ?? 0,
    resellerDiscountCents: input.resellerDiscountCents ?? 0,
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
    // Round 26 #2 — optional shipping note
    shippingNote: input.shippingNote ?? null,
  };

  // Audit v2 #5.2 — on n'incrémente PLUS PromoCode.usesCount ici. Avant :
  // increment à la création PENDING, sans garde `usesCount < maxUses`
  // (over-redemption concurrent) ET jamais décrémenté sur abandon → drift, codes
  // « épuisés » prématurément (clients refusés à tort). L'increment vit
  // désormais dans markOrderPaidWithWalletDebit, au passage PAID, gardé.
  // Le promoCodeId reste persté sur l'Order (intention) pour l'increment.
  return prisma.order.create({ data: orderData });
}

// ─── ORDER TRANSITIONS ────────────────────────────────────────────────────
// Toujours append-only sur OrderEvent — l'historique de statut sert pour
// le debug + le timeline UI plus tard.

export async function markOrderPaid(paymentIntentId: string) {
  const order = await prisma.order.findUnique({ where: { paymentIntentId } });
  if (!order) throw new OrderNotFoundError(paymentIntentId);

  // Round 38 #4 — Optimistic guard : seulement PENDING → PAID. Si
  // déjà PAID/SUBMITTED/etc (Stripe webhook replay), skip cleanly.
  return prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (result.count === 0) {
      // Already past PENDING (replay or admin manual) — idempotent skip
      return;
    }
    await tx.orderEvent.create({
      data: { orderId: order.id, kind: 'PAYMENT_SUCCEEDED' },
    });
  });
}

/**
 * Round 36 #1 — variant atomique de markOrderPaid qui inclut le debit
 * wallet dans la MÊME $transaction. Avant : 2 transactions séparées
 * (markOrderPaid → recordWalletTx), si le process crashait entre les 2,
 * l'order était PAID mais le wallet pas débité = customer paie Stripe ET
 * garde son crédit (split-brain ledger).
 *
 * @param input.paymentIntentId - Stripe PI ID (lookup l'order)
 * @param input.walletDebit - Si provided, debit le wallet user de N cents
 *   dans la même transaction. Throws si overdraft (wallet < amount).
 *
 * @returns `{ order, transitioned }`. transitioned=true SEULEMENT si CET appel a
 *   gagné la transition atomique PENDING→PAID. Le caller (webhook) ne doit
 *   soumettre à Sinalite / créditer le referral / envoyer l'email QUE si
 *   transitioned===true — sinon deux events Stripe concurrents produiraient la
 *   commande deux fois (le guard updateMany garantit un seul gagnant).
 */
export async function markOrderPaidWithWalletDebit(input: {
  paymentIntentId: string;
  walletDebit?: {
    userId: string;
    /** Positive cents à débiter (ex 1500 = -15 $) */
    amountCents: number;
    description: string;
  };
}) {
  const order = await prisma.order.findUnique({ where: { paymentIntentId: input.paymentIntentId } });
  if (!order) throw new OrderNotFoundError(input.paymentIntentId);

  // Audit v2 #3.3 — manque wallet capturé dans la tx, alerté APRÈS commit (pas
  // de side-effect réseau pendant la transaction).
  let walletShortfallCents = 0;

  const result = await prisma.$transaction(async (tx) => {
    // Round 38 #4 — Optimistic guard PENDING → PAID. Si déjà past
    // PENDING (Stripe webhook replay), skip cleanly (caller's 'already
    // past PENDING' check est upstream, mais defensive layer ici).
    const guard = await tx.order.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (guard.count === 0) {
      // Already paid (replay OU event concurrent qui a PERDU la course atomique) —
      // pas d'event/wallet debit. transitioned:false → le caller (webhook) ne doit
      // PAS (re)soumettre à Sinalite ni (re)créditer le referral (anti double-prod).
      const existing = await tx.order.findUnique({ where: { id: order.id } });
      return { order: existing!, transitioned: false as const };
    }
    const updatedOrder = await tx.order.findUnique({ where: { id: order.id } });
    await tx.orderEvent.create({
      data: { orderId: order.id, kind: 'PAYMENT_SUCCEEDED' },
    });

    // 2. Wallet debit dans la MÊME transaction si applicable
    if (input.walletDebit && input.walletDebit.amountCents > 0) {
      // Round 38 #4 — atomic wallet decrement avec WHERE guard (cf.
      // recordWalletTx Round 38 #3).
      const walletGuard = await tx.user.updateMany({
        where: {
          id: input.walletDebit.userId,
          walletCents: { gte: input.walletDebit.amountCents },
        },
        data: {
          walletCents: { decrement: input.walletDebit.amountCents },
          walletLastActivityAt: new Date(),
        },
      });
      if (walletGuard.count === 0) {
        const user = await tx.user.findUnique({
          where: { id: input.walletDebit.userId },
          select: { walletCents: true },
        });
        if (!user) {
          throw new Error(`User ${input.walletDebit.userId} introuvable pour wallet debit`);
        }
        // Audit v2 #3.3 — solde insuffisant à la confirmation : deux PI
        // concurrents ont planifié le même solde wallet. AVANT : on throwait →
        // tx rollback → l'order restait PENDING alors que Stripe a DÉJÀ capturé
        // le paiement → client chargé sans commande (et, depuis #2.2, retry en
        // boucle jusqu'au dead-letter). MAINTENANT : on débite le DISPONIBLE
        // (clamp ≥ 0), on complète l'order, et on alerte le manque APRÈS commit
        // pour réconciliation. Même pattern que le crédit referral (#3.1).
        const avail = Math.max(0, user.walletCents);
        if (avail > 0) {
          await tx.user.update({
            where: { id: input.walletDebit.userId },
            data: {
              walletCents: { decrement: avail },
              walletLastActivityAt: new Date(),
            },
          });
          await tx.walletTransaction.create({
            data: {
              userId: input.walletDebit.userId,
              kind: 'ORDER_SPEND',
              amountCents: -avail,
              balanceAfterCents: 0, // on a vidé le disponible
              orderId: order.id,
              description: `${input.walletDebit.description} (clampé ${avail}/${input.walletDebit.amountCents}¢)`.slice(0, 500),
            },
          });
        }
        walletShortfallCents = input.walletDebit.amountCents - avail;
        logWebhook.warn(
          {
            orderId: order.id,
            userId: input.walletDebit.userId,
            applied: input.walletDebit.amountCents,
            debited: avail,
            shortfall: walletShortfallCents,
          },
          'wallet insuffisant au débit — clampé (concurrent spend, reconcile manuel)',
        );
      } else {
        const userAfter = await tx.user.findUnique({
          where: { id: input.walletDebit.userId },
          select: { walletCents: true },
        });
        const newBalance = userAfter!.walletCents;

        await tx.walletTransaction.create({
          data: {
            userId: input.walletDebit.userId,
            kind: 'ORDER_SPEND',
            amountCents: -input.walletDebit.amountCents,
            balanceAfterCents: newBalance,
            orderId: order.id,
            description: input.walletDebit.description.slice(0, 500),
          },
        });
      }
    }

    // 3. Audit v2 #3.1 — débit du crédit REFERRAL à la confirmation (déplacé
    // depuis la création de l'order). Même tx, protégé par le guard PENDING→PAID
    // ci-dessus (count===0 → early-return) → débité exactement une fois, jamais
    // sur un order non payé. Garde `gte` = plancher (jamais de balance négative).
    if (order.referralCreditAppliedCents > 0) {
      const refGuard = await tx.user.updateMany({
        where: {
          id: order.userId,
          referralCreditCents: { gte: order.referralCreditAppliedCents },
        },
        data: { referralCreditCents: { decrement: order.referralCreditAppliedCents } },
      });
      if (refGuard.count === 0) {
        // Solde insuffisant (rare : 2 checkouts concurrents ont consommé le même
        // crédit). On NE throw PAS — sinon l'order resterait PENDING alors que le
        // client a déjà payé la part Stripe. On débite le restant (clamp ≥ 0) et
        // on logge le manque pour réconciliation manuelle.
        const u = await tx.user.findUnique({
          where: { id: order.userId },
          select: { referralCreditCents: true },
        });
        const avail = Math.max(0, u?.referralCreditCents ?? 0);
        if (avail > 0) {
          await tx.user.update({
            where: { id: order.userId },
            data: { referralCreditCents: { decrement: avail } },
          });
        }
        logWebhook.warn(
          {
            orderId: order.id,
            userId: order.userId,
            applied: order.referralCreditAppliedCents,
            debited: avail,
          },
          'referral credit insuffisant au débit — clampé (rabais > solde, reconcile manuel)',
        );
      }
    }

    // 4. Audit v2 #5.2 — increment du compteur d'usage promo à la CONFIRMATION,
    // gardé `usesCount < maxUses` (comparaison colonne-à-colonne → SQL brut,
    // atomique, anti over-redemption). Protégé par le guard PENDING→PAID →
    // exactement une fois, jamais sur un order non payé (plus de drift).
    if (order.promoCodeId) {
      const affected = await tx.$executeRaw`
        UPDATE "PromoCode"
        SET "usesCount" = "usesCount" + 1
        WHERE "id" = ${order.promoCodeId}
          AND ("maxUses" IS NULL OR "usesCount" < "maxUses")
      `;
      if (affected === 0) {
        // Course « dernière place » : le code a atteint maxUses entre le checkout
        // et le paiement. Le client garde son rabais (Stripe a déjà capturé) ; on
        // n'incrémente pas au-delà du cap. Log pour visibilité.
        logWebhook.warn(
          { orderId: order.id, promoCodeId: order.promoCodeId },
          'promo usesCount non incrémenté — maxUses atteint entre checkout et paiement (rabais honoré)',
        );
      }
    }

    return { order: updatedOrder!, transitioned: true as const };
  });

  // Audit v2 #3.3 — alerte APRÈS commit si le wallet a été clampé (le paiement
  // Stripe est honoré, l'order complétée, mais le solde réel était < appliqué).
  if (walletShortfallCents > 0) {
    const { sendCriticalAlert } = await import('@/lib/alerting/slack');
    await sendCriticalAlert({
      severity: 'warning',
      title: 'Wallet insuffisant au débit — clampé',
      body: `Order ${order.id} : le wallet appliqué dépassait le solde réel (concurrent spend ?). Le paiement Stripe a été honoré et l'order complétée, mais ${(walletShortfallCents / 100).toFixed(2)} $ n'ont pas pu être débités. Vérifie le ledger /admin/users/${order.userId}.`,
      context: {
        orderId: order.id,
        userId: order.userId,
        shortfallCents: walletShortfallCents,
      },
    });
  }

  return result;
}

/**
 * Round 38 #4 — Optimistic locking strategy pour Order.status transitions.
 *
 * Avant : `prisma.order.update({where:{id}, data:{status:'X'}})` écrasait
 * sans WHERE-guard. Si 2 webhooks concurrents (Stripe payment + admin
 * cancel manuel quasi-simultanés) → race condition silent : CANCELLED
 * pouvait être re-flippé PAID, ou SHIPPED arriver AVANT IN_PRODUCTION
 * (out-of-order webhook Sinalite) → UI customer voit le statut "regresser".
 *
 * Maintenant : chaque markOrder* utilise `updateMany` avec WHERE status
 * IN (allowed-prior-states). Si count=0 → on log + skip silently OU
 * throw selon le caller. Idempotency préservée pour webhooks replay.
 */

/** Status transitions valides (FSM). Out-of-order = rejected. */
const ALLOWED_PRIOR_STATUSES: Record<string, OrderStatus[]> = {
  PAID: ['PENDING'],
  SUBMITTED: ['PAID'],
  IN_PRODUCTION: ['SUBMITTED', 'IN_PRODUCTION'], // idempotent re-receive
  SHIPPED: ['SUBMITTED', 'IN_PRODUCTION', 'SHIPPED'], // skip IN_PRODUCTION OK
  DELIVERED: ['SHIPPED', 'DELIVERED'], // idempotent
  CANCELLED: ['PENDING', 'PAID', 'SUBMITTED'], // pas après production lancée
  FAILED: ['PENDING', 'PAID', 'SUBMITTED', 'IN_PRODUCTION'], // pas après SHIPPED
};

export async function markOrderSubmitted(input: {
  orderId: string;
  sinaliteOrderId: number;
}) {
  // Round 38 #4 — Optimistic guard : seulement si status courant = PAID
  return prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: {
        id: input.orderId,
        status: { in: ALLOWED_PRIOR_STATUSES.SUBMITTED },
      },
      data: {
        status: 'SUBMITTED',
        sinaliteOrderId: String(input.sinaliteOrderId),
      },
    });
    if (result.count === 0) {
      // Soit l'order n'existe pas, soit déjà flippé hors PAID. Log + skip.
      const current = await tx.order.findUnique({
        where: { id: input.orderId },
        select: { status: true },
      });
      throw new OrderStatusTransitionError(
        `Cannot transition order ${input.orderId} to SUBMITTED (current: ${current?.status ?? 'NOT_FOUND'})`,
      );
    }
    await tx.orderEvent.create({
      data: {
        orderId: input.orderId,
        kind: 'SINALITE_SUBMITTED',
        data: JSON.stringify({ sinaliteOrderId: input.sinaliteOrderId }),
      },
    });
  });
}

export async function markOrderFailed(input: {
  orderId: string;
  reason: string;
  data?: unknown;
}) {
  // Round 38 #4 — Optimistic guard : pas de fail après SHIPPED/DELIVERED
  // (l'order est physiquement parti, ça n'a plus de sens de la marquer
  // FAILED). Si déjà CANCELLED/FAILED, idempotent skip.
  return prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: {
        id: input.orderId,
        status: { in: ALLOWED_PRIOR_STATUSES.FAILED },
      },
      data: { status: 'FAILED', failureReason: input.reason.slice(0, 500) },
    });
    if (result.count === 0) {
      const current = await tx.order.findUnique({
        where: { id: input.orderId },
        select: { status: true },
      });
      throw new OrderStatusTransitionError(
        `Cannot transition order ${input.orderId} to FAILED (current: ${current?.status ?? 'NOT_FOUND'})`,
      );
    }
    await tx.orderEvent.create({
      data: {
        orderId: input.orderId,
        kind: 'ERROR',
        data: input.data ? JSON.stringify(input.data).slice(0, 2000) : null,
      },
    });
  });
}

/** Thrown by markOrder* helpers si la transition est invalide (audit Round 38 #4). */
export class OrderStatusTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderStatusTransitionError';
  }
}

export async function markRefundIssued(input: {
  orderId: string;
  refundId: string;
  /** Audit v2 #10.6 — montant RÉELLEMENT remboursé en cents (= refund.amount
   *  Stripe). Sans ça, le dashboard finances comptait chaque refund comme un
   *  remboursement TOTAL de la commande → revenu net faussé sur les refunds
   *  partiels. Optionnel pour rétrocompat (vieux events → fallback order total). */
  amountCents?: number;
}) {
  return prisma.orderEvent.create({
    data: {
      orderId: input.orderId,
      kind: 'REFUND_ISSUED',
      data: JSON.stringify({
        refundId: input.refundId,
        ...(input.amountCents !== undefined && { amountCents: input.amountCents }),
      }),
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
}): Promise<{ transitioned: boolean; orderId: string; fromStatus: string; toStatus: OrderStatus }> {
  const order = await prisma.order.findUnique({
    where: { sinaliteOrderId: String(input.sinaliteOrderId) },
  });
  if (!order) throw new OrderNotFoundError(`sinalite=${input.sinaliteOrderId}`);

  const nextStatus = SINALITE_TO_DB_STATUS[input.status];

  // Audit v2 #3.2 — applique la FSM (avant : `order.update` brut SANS garde →
  // un webhook tardif/désordonné régressait le statut, ex DELIVERED→IN_PRODUCTION,
  // contredisant l'invariant Round 38 #4). On garde via `updateMany` WHERE status
  // IN (prior autorisés) ET status != nextStatus → la transition n'a lieu QUE si
  // elle est valide ET que c'est un VRAI changement (pas un self-loop / re-push
  // d'ETA). On retourne `transitioned` pour que le caller n'émette les emails
  // (et le refund CANCELLED) qu'une seule fois, sur une transition réelle.
  const allowedPrior = ALLOWED_PRIOR_STATUSES[nextStatus] ?? [];

  return prisma.$transaction(async (tx) => {
    const guard = await tx.order.updateMany({
      where: {
        id: order.id,
        status: { in: allowedPrior, not: nextStatus },
      },
      data: { status: nextStatus },
    });
    const transitioned = guard.count > 0;

    // OrderEvent enregistré TOUJOURS (audit du webhook reçu, même no-op) — utile
    // pour debug des out-of-order / replays. On stamp le résultat de transition.
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'SINALITE_STATUS_CHANGED',
        data: JSON.stringify({
          payload: input.data,
          transitioned,
          fromStatus: order.status,
          toStatus: nextStatus,
        }).slice(0, 2000),
      },
    });

    return { transitioned, orderId: order.id, fromStatus: order.status, toStatus: nextStatus };
  });
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

export type WebhookSource = 'STRIPE' | 'SINALITE' | 'SES';

export async function recordWebhookEvent(input: {
  source: WebhookSource;
  eventId: string;
  eventType: string;
  /** Raw body for future replays. Optional — pre-replay-feature rows had no
   *  payload, future events should always provide it. */
  payload?: string;
}): Promise<{ isNew: boolean; alreadyCompleted: boolean }> {
  try {
    await prisma.webhookEvent.create({
      data: {
        source: input.source,
        eventId: input.eventId,
        eventType: input.eventType,
        // Audit v2 #2.2 — CLAIM pessimiste : la row démarre `success=false`
        // (= « non confirmé ») et n'est flippée à `true` que par
        // updateWebhookOutcome quand le handler RÉUSSIT. Ça permet de
        // distinguer « déjà traité avec succès » (dedup légitime) de
        // « tentative précédente échouée / en cours » (à re-traiter au retry).
        //
        // Avant : `success @default(true)` rendait une row fraîche
        // indistinguable d'un succès → un échec transitoire (blip DB, overdraft
        // wallet, Sinalite+refund KO) insérait quand même la row, puis chaque
        // retry Stripe re-tombait sur P2002 → isNew:false → 200 `deduped` SANS
        // retraiter. Le retry automatique Stripe était donc neutralisé ;
        // récupération uniquement via replay manuel (dead-letter 24h+).
        success: false,
        ...(input.payload !== undefined && { payload: input.payload }),
      },
    });
    return { isNew: true, alreadyCompleted: false };
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      // Row déjà présente. On ne déduplique QUE si une tentative précédente a
      // réellement RÉUSSI (success=true). Sinon (échec / in-flight), on laisse
      // le caller re-traiter → le retry Stripe redevient effectif.
      const existing = await prisma.webhookEvent.findUnique({
        where: { source_eventId: { source: input.source, eventId: input.eventId } },
        select: { success: true },
      });
      return { isNew: false, alreadyCompleted: existing?.success === true };
    }
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

export function isPrismaUniqueError(err: unknown): boolean {
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
