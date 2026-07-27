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
  // finding [49] — trace client d'une demande d'annulation (avant : seul un
  // email admin + AdminAudit existaient, RIEN de visible pour le client sur
  // /orders/[id] une fois la modale fermée).
  'CANCEL_REQUESTED',
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

    // 2+3. Crédits wallet/referral — PLUS AUCUN DÉBIT ICI (correctif M2/M3).
    //   Depuis reserve-at-create (credit-reservation.ts), le solde wallet ET referral est
    //   décrémenté ATOMIQUEMENT à la création de l'Order (réservation), pas au paiement.
    //   Re-débiter ici double-décrémenterait. Le webhook ne fait que CONFIRMER l'order
    //   (transitioned-guard ci-dessus → exactement une fois). Le ledger ORDER_SPEND est
    //   écrit au create ; la restauration sur abandon/annulation vit dans
    //   releaseReservedCreditsOnCancel, gardée par la transition PENDING→CANCELLED.
    //   `input.walletDebit` est conservé pour compat de signature mais N'EST PLUS UTILISÉ.
    void input.walletDebit;

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

  // (L'ancienne alerte « wallet clampé au débit » n'a plus lieu d'être : le débit
  //  a disparu du webhook — le solde est réservé/garanti au create. Une insuffisance
  //  concurrente est désormais refusée EN AMONT au create, 409, cf. createReservedOrder.)

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
    //
    // Format PLAT (pas imbriqué sous `payload`) : timeline.ts/event-describe.ts
    // lisent `status`/`trackingNumber`/`carrier` à la racine, comme le fait déjà
    // le chemin admin manuel (status/route.ts). Un ancien format imbriqué aurait
    // rendu le numéro de suivi invisible dans le portail — cf.
    // docs/experience-client-2026-07.md Foyer 5.
    const rawPayload =
      input.data && typeof input.data === 'object' ? (input.data as Record<string, unknown>) : {};
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        kind: 'SINALITE_STATUS_CHANGED',
        data: JSON.stringify({
          ...rawPayload,
          transitioned,
          fromStatus: order.status,
          toStatus: nextStatus,
          source: 'sinalite_webhook',
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
