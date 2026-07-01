/**
 * Réservation ATOMIQUE des crédits wallet/referral AU CREATE (correctif M2/M3).
 *
 * Problème (audit v3 M2/M3) : le crédit était LU au create sans lock et débité
 * seulement au webhook PAID → deux checkouts concurrents lisaient le même solde et
 * l'appliquaient chacun en entier → perte cash. Correctif : décrémenter le solde
 * ATOMIQUEMENT dès la création de l'Order (réservation), dans la MÊME transaction
 * que `order.create`.
 *
 * Séquence CRITIQUE dans la tx : `order.create` D'ABORD, réservation ENSUITE.
 *  - `order.create` porte `paymentIntentId @unique` → un double-submit (même PI, via
 *    l'idempotence Stripe) lève **P2002 AVANT tout décrément** → on retourne l'Order
 *    existant sans re-réserver (fix B2 : l'idempotence Stripe ne protège que l'appel
 *    Stripe, pas la tx Prisma).
 *  - la réservation (`updateMany where gte + decrement`) est atomique (Postgres
 *    row-locke l'UPDATE conditionnel) → deux Orders DIFFÉRENTS concurrents : le 2e voit
 *    le solde réduit, `count===0` → InsufficientCreditError → le caller rejette 409
 *    (FORK 1 décidé : rejet, pas de re-pricing).
 *
 * Le webhook NE re-débite PLUS (cf. markOrderPaidWithWalletDebit). La restauration sur
 * abandon/annulation vit dans `releaseReservedCreditsOnCancel`, gardée par la transition
 * d'état de l'Order (exactement-une-fois).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { CreateOrderInput } from '@/lib/db/orders';

/** Levée quand le solde réservable est insuffisant au create (concurrence). Le caller → 409/err. */
export class InsufficientCreditError extends Error {
  constructor(public readonly creditKind: 'wallet' | 'referral') {
    super(`Solde ${creditKind} insuffisant (réservé par un checkout concurrent).`);
    this.name = 'InsufficientCreditError';
  }
}

function buildOrderData(input: CreateOrderInput) {
  return {
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
    shippingNote: input.shippingNote ?? null,
  };
}

export interface ReservedOrderResult {
  order: { id: string; [k: string]: unknown };
  /** true = un Order existait déjà pour ce paymentIntentId (double-submit) → PAS de nouvelle réservation. */
  replay: boolean;
}

/**
 * Crée l'Order PENDING ET réserve (décrémente) les crédits wallet/referral appliqués,
 * atomiquement. `order.create` d'abord (garde d'idempotence via paymentIntentId unique),
 * réservation ensuite (garde anti-double-dip via gte). Voir en-tête pour la séquence.
 *
 * @throws InsufficientCreditError si le solde réservable est insuffisant (→ 409/err).
 */
export async function createReservedOrder(input: CreateOrderInput): Promise<ReservedOrderResult> {
  const walletReserve = input.walletCreditAppliedCents ?? 0;
  const referralReserve = input.referralCreditAppliedCents ?? 0;
  const orderData = buildOrderData(input);

  try {
    const order = await prisma.$transaction(async (tx) => {
      // 1. order.create D'ABORD : paymentIntentId @unique → P2002 sur double-submit
      //    AVANT tout décrément (rien réservé en double).
      const created = await tx.order.create({ data: orderData });

      // 2. Réservation wallet (décrément atomique gardé). count===0 → insuffisant → rollback.
      if (walletReserve > 0) {
        const r = await tx.user.updateMany({
          where: { id: input.userId, walletCents: { gte: walletReserve } },
          data: { walletCents: { decrement: walletReserve }, walletLastActivityAt: new Date() },
        });
        if (r.count === 0) throw new InsufficientCreditError('wallet');
        const u = await tx.user.findUnique({ where: { id: input.userId }, select: { walletCents: true } });
        await tx.walletTransaction.create({
          data: {
            userId: input.userId,
            kind: 'ORDER_SPEND',
            amountCents: -walletReserve,
            balanceAfterCents: u?.walletCents ?? 0,
            orderId: created.id,
            description: `Commande #${created.id.slice(-6)} — crédit portefeuille réservé`,
          },
        });
      }

      // 3. Réservation referral (pas de ledger dédié → marqueur OrderEvent pour l'audit/restore).
      if (referralReserve > 0) {
        const r = await tx.user.updateMany({
          where: { id: input.userId, referralCreditCents: { gte: referralReserve } },
          data: { referralCreditCents: { decrement: referralReserve } },
        });
        if (r.count === 0) throw new InsufficientCreditError('referral');
        // Pas de ledger/événement referral dédié : l'audit = Order.referralCreditAppliedCents
        // + Order.status (PENDING=réservé, PAID=dépensé, CANCELLED=restauré).
      }

      return created;
    });
    return { order, replay: false };
  } catch (e) {
    // Double-submit : un Order existe déjà pour ce paymentIntentId → retour idempotent,
    // AUCUNE re-réservation (la tx qui a levé P2002 a roll-back son propre décrément).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await prisma.order.findUnique({ where: { paymentIntentId: input.paymentIntentId } });
      if (existing) return { order: existing, replay: true };
    }
    throw e; // InsufficientCreditError (→ caller 409) ou autre.
  }
}

/**
 * Restaure (ré-incrémente) les crédits RÉSERVÉS d'un Order abandonné/annulé, exactement
 * une fois. Idempotence + exclusion mutuelle avec le débit-final garanties par la
 * transition d'état de l'Order : on ne restaure QUE si on gagne la transition
 * PENDING→CANCELLED (`count===1`). Un rejeu / un chemin concurrent verra `count===0`
 * (déjà transitionné) → no-op. Un Order PAID ne peut pas être annulé ici (guard PENDING).
 *
 * @returns { released, walletCents, referralCents } — released=false si déjà transitionné.
 */
export async function releaseReservedCreditsOnCancel(input: {
  orderId: string;
  reason?: string;
}): Promise<{ released: boolean; walletCents: number; referralCents: number }> {
  return prisma.$transaction(async (tx) => {
    // Garde atomique : gagne la transition {PENDING|FAILED}→CANCELLED, ou no-op.
    //   PENDING = abandon/annulation ; FAILED = paiement échoué jamais retenté (libéré par
    //   le cron après TTL). CANCELLED est TERMINAL → jamais re-restauré (count===0).
    //   ⚠️ `paidAt: null` = garde d'IDEMPOTENCE INTRINSÈQUE contre le double-restore INVERSE :
    //   un Order payé-puis-remboursé retombe en FAILED (auto-refund Sinalite, cancel admin) MAIS
    //   son crédit a DÉJÀ été restauré par le chemin refund. `paidAt !== null` → on NE restaure
    //   PAS (count===0). Seul un Order JAMAIS payé (crédit encore réservé) est libéré ici.
    const t = await tx.order.updateMany({
      where: { id: input.orderId, status: { in: ['PENDING', 'FAILED'] }, paidAt: null },
      data: { status: 'CANCELLED' },
    });
    if (t.count === 0) return { released: false, walletCents: 0, referralCents: 0 };

    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { userId: true, walletCreditAppliedCents: true, referralCreditAppliedCents: true },
    });
    if (!order) return { released: false, walletCents: 0, referralCents: 0 };

    const wallet = order.walletCreditAppliedCents ?? 0;
    const referral = order.referralCreditAppliedCents ?? 0;

    if (wallet > 0) {
      await tx.user.update({
        where: { id: order.userId },
        data: { walletCents: { increment: wallet }, walletLastActivityAt: new Date() },
      });
      const u = await tx.user.findUnique({ where: { id: order.userId }, select: { walletCents: true } });
      await tx.walletTransaction.create({
        data: {
          userId: order.userId,
          kind: 'REFUND',
          amountCents: wallet,
          balanceAfterCents: u?.walletCents ?? 0,
          orderId: input.orderId,
          description: `Commande #${input.orderId.slice(-6)} annulée — crédit portefeuille restauré`,
        },
      });
    }
    if (referral > 0) {
      await tx.user.update({
        where: { id: order.userId },
        data: { referralCreditCents: { increment: referral } },
      });
    }
    // Pas d'OrderEvent dédié : Order.status=CANCELLED + le ledger wallet (REFUND) tracent
    // l'annulation ; on évite d'introduire un kind qui rippellerait sur 8 Record exhaustifs.
    return { released: true, walletCents: wallet, referralCents: referral };
  });
}
