/**
 * Wallet operations — recordTransaction + topup helpers.
 *
 * Toujours utiliser ces helpers (jamais update direct sur User.walletCents)
 * pour garantir que le ledger WalletTransaction est tenu à jour.
 *
 * Transactions atomiques via prisma.$transaction — si l'INSERT ledger
 * fail, l'UPDATE wallet est rollback.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logEmail as log } from '@/lib/logger';

export type WalletTxKind =
  | 'TOPUP'
  | 'TOPUP_BONUS'
  | 'ORDER_SPEND'
  | 'REFUND'
  | 'ADMIN_ADJUSTMENT'
  | 'EXPIRY';

interface RecordOpts {
  userId: string;
  kind: WalletTxKind;
  /** Signed cents : + pour credit, - pour debit. */
  amountCents: number;
  description: string;
  paymentIntentId?: string;
  orderId?: string;
  adminId?: string;
}

/**
 * Enregistre une transaction wallet atomique : update User.walletCents +
 * insert WalletTransaction row. Retourne le nouveau balance.
 *
 * Throws si :
 *   - amountCents = 0 (no-op interdit pour traçabilité)
 *   - balance résultant < 0 (anti-overdraft sauf ADMIN_ADJUSTMENT)
 *   - user introuvable
 */
export async function recordWalletTx(opts: RecordOpts): Promise<{ balanceAfterCents: number; txId: string }> {
  if (opts.amountCents === 0) {
    throw new Error('Wallet tx with 0 amount is invalid');
  }

  return prisma.$transaction(async (tx) => {
    // Round 38 #3 — Atomic increment via Prisma operator + WHERE guard.
    //
    // Avant : findUnique + compute + update = 3 steps avec race (2 calls
    // concurrents peuvent lire la même walletCents stale, écrire la même
    // value → 1 tx perdue silencieusement, ledger overspend possible).
    //
    // Maintenant : pour les DEBITS, on utilise updateMany avec WHERE
    // walletCents >= |amount|. Postgres garantit l'atomicité du
    // INC-with-condition au niveau row-lock. Si count=0 → overdraft
    // détecté atomic. Pour les CREDITS, straight increment (no guard
    // needed, on n'overflow pas Int32 dans les cas réels).
    const baseData = {
      walletCents: { increment: opts.amountCents },
      walletLastActivityAt: new Date(),
      ...(opts.kind === 'EXPIRY' && { walletExpiryWarningAt: null }),
    };

    if (opts.amountCents < 0 && opts.kind !== 'ADMIN_ADJUSTMENT') {
      // DEBIT path : atomic guard contre overdraft
      const result = await tx.user.updateMany({
        where: {
          id: opts.userId,
          walletCents: { gte: -opts.amountCents }, // -opts.amountCents = abs value
        },
        data: baseData,
      });
      if (result.count === 0) {
        // Soit user introuvable, soit walletCents insuffisant. On distingue
        // pour donner un message clair.
        const exists = await tx.user.findUnique({
          where: { id: opts.userId },
          select: { walletCents: true },
        });
        if (!exists) throw new Error(`User ${opts.userId} introuvable`);
        throw new Error(
          `Wallet overdraft refusé : user ${opts.userId} a ${exists.walletCents} cents, tentative debit ${opts.amountCents} (atomic check)`,
        );
      }
    } else {
      // CREDIT path ou ADMIN_ADJUSTMENT (qui peut négative w/o guard)
      const result = await tx.user.updateMany({
        where: { id: opts.userId },
        data: baseData,
      });
      if (result.count === 0) {
        throw new Error(`User ${opts.userId} introuvable`);
      }
    }

    // Re-fetch pour le balance snapshot (single SELECT, dans la même tx
    // donc voit le résultat du update au-dessus).
    const after = await tx.user.findUnique({
      where: { id: opts.userId },
      select: { walletCents: true },
    });
    if (!after) throw new Error(`User ${opts.userId} disparu pendant la tx`);
    const newBalance = after.walletCents;

    const txRow = await tx.walletTransaction.create({
      data: {
        userId: opts.userId,
        kind: opts.kind,
        amountCents: opts.amountCents,
        balanceAfterCents: newBalance,
        paymentIntentId: opts.paymentIntentId ?? null,
        orderId: opts.orderId ?? null,
        adminId: opts.adminId ?? null,
        description: opts.description.slice(0, 500),
      },
    });

    log.info({
      userId: opts.userId,
      kind: opts.kind,
      amountCents: opts.amountCents,
      newBalance,
      txId: txRow.id,
    }, 'wallet tx recorded (atomic)');

    return { balanceAfterCents: newBalance, txId: txRow.id };
  });
}

/**
 * Restaure le crédit wallet appliqué à une commande lors d'un FULL refund.
 *
 * Audit v2 #1.2/#1.4 — extrait en helper PARTAGÉ du fix Round 37 #1 (qui ne
 * vivait que dans /admin/orders/[id]/refund). Le même besoin existe sur 3
 * chemins de remboursement total : refund admin, cancel admin, et auto-refund
 * webhook (échec imprimeur). Sans ça, un client qui a payé 100 $ = 80 $ Stripe
 * + 20 $ wallet ne récupère que les 80 $ → 20 $ perdus silencieusement.
 *
 * Idempotent : ne restaure qu'UNE fois par commande (garde findFirst REFUND) →
 * safe pour le chemin webhook qui peut retry, et pour un double-clic admin.
 * Non-fatal : si la restauration échoue, on log + alerte critique mais on NE
 * throw PAS (le refund Stripe a déjà réussi ; on ne veut jamais rollback un
 * vrai remboursement à cause de la comptabilité wallet).
 *
 * @returns cents effectivement restaurés (0 si rien à faire ou déjà restauré).
 */
export async function restoreWalletCreditOnFullRefund(input: {
  order: { id: string; userId: string; walletCreditAppliedCents: number };
  /** Acteur : id admin, ou undefined pour le système (webhook auto-refund). */
  actorId?: string;
  /** ID du refund Stripe, pour le contexte d'alerte. */
  refundId?: string;
}): Promise<number> {
  const { order } = input;
  if (order.walletCreditAppliedCents <= 0) return 0;

  // Idempotence : si un REFUND wallet existe déjà pour cette commande, ne pas
  // re-créditer (retry webhook, double-clic admin). Une commande n'est
  // entièrement remboursée qu'une fois.
  const existing = await prisma.walletTransaction.findFirst({
    where: { orderId: order.id, kind: 'REFUND' },
    select: { id: true },
  });
  if (existing) return 0;

  try {
    await recordWalletTx({
      userId: order.userId,
      kind: 'REFUND',
      amountCents: order.walletCreditAppliedCents, // POSITIF — credit back
      orderId: order.id,
      adminId: input.actorId,
      description: `Refund order #${order.id.slice(-6)} — wallet credit restored`,
    });
    return order.walletCreditAppliedCents;
  } catch (err) {
    const { logStripe } = await import('@/lib/logger');
    logStripe.error(
      { err, orderId: order.id, walletAppliedCents: order.walletCreditAppliedCents },
      'wallet restore on refund failed (non-fatal — manual reconcile needed)',
    );
    const { sendCriticalAlert } = await import('@/lib/alerting/slack');
    void sendCriticalAlert({
      severity: 'critical',
      title: 'Wallet restore on refund FAILED',
      body: `Stripe refund OK mais wallet credit non restauré. Ajuste manuellement /admin/users/${order.userId}.`,
      context: {
        orderId: order.id,
        refundId: input.refundId,
        walletAppliedCents: order.walletCreditAppliedCents,
        error: err instanceof Error ? err.message : 'unknown',
      },
    });
    return 0;
  }
}

/**
 * Process un topup complet : record le TOPUP + le TOPUP_BONUS si tier.
 * 2 rows dans le ledger (audit clair : "voici ton vrai paiement, voici le bonus").
 *
 * Round 37 #1 — Atomique : les 2 inserts vivent dans la MÊME prisma.$transaction.
 * Avant : si TOPUP commit puis TOPUP_BONUS fail (DB blip), le user payait pour le
 * bonus tier mais ne le recevait pas (ledger split-brain → support ticket).
 *
 * Audit v2 #2.1 — IDEMPOTENT : le replay admin d'un webhook topup
 * (`checkout.session.completed`/`invoice.paid`) bypasse le dedup WebhookEvent.
 * Sans garde, rejouer crédite 2× (vrai argent injecté). On no-op si un TOPUP
 * existe déjà pour ce paymentIntent. Le chemin order, lui, est protégé par le
 * garde `status !== 'PENDING'`.
 *
 * Audit v2 #3.4 — Concurrence : on prend un verrou pessimiste sur la row User
 * (`SELECT … FOR UPDATE`) AVANT le findFirst, ce qui sérialise les topups
 * concurrents du même user → le couple « check idempotence → insert » est
 * atomique sans contrainte DB (un `@@unique([paymentIntentId, kind])` ferait
 * échouer `prisma migrate deploy` si la prod a déjà des doublons hérités du
 * bug). Et on crédite via `increment` atomique (avant : read-modify-write sur
 * une lecture non verrouillée → topup + checkout concurrents = mouvement perdu).
 *
 * @returns totalCreditCents=0 + alreadyProcessed=true si le topup était déjà
 *          enregistré (replay).
 */
export async function processWalletTopup(opts: {
  userId: string;
  amountCents: number;
  paymentIntentId: string;
  bonusCents: number;
  tierLabel: string | null;
}): Promise<{ totalCreditCents: number; balanceAfterCents: number; alreadyProcessed?: boolean }> {
  return prisma.$transaction(async (tx) => {
    // #3.4 — verrou pessimiste : sérialise les topups concurrents du même user
    // pour rendre le garde d'idempotence (findFirst → create) atomique sans
    // contrainte DB. La row reste verrouillée jusqu'au commit de la transaction.
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "User" WHERE id = ${opts.userId} FOR UPDATE`,
    );
    if (locked.length === 0) {
      throw new Error(`User ${opts.userId} introuvable pour wallet topup`);
    }

    // #2.1 — idempotence : un TOPUP existe déjà pour ce paymentIntent → no-op.
    const existing = await tx.walletTransaction.findFirst({
      where: { paymentIntentId: opts.paymentIntentId, kind: 'TOPUP' },
      select: { id: true },
    });
    if (existing) {
      const current = await tx.user.findUnique({
        where: { id: opts.userId },
        select: { walletCents: true },
      });
      log.info({
        userId: opts.userId,
        paymentIntentId: opts.paymentIntentId,
      }, 'wallet topup skipped — already processed (idempotent replay)');
      return {
        totalCreditCents: 0,
        balanceAfterCents: current?.walletCents ?? 0,
        alreadyProcessed: true,
      };
    }

    // 1. TOPUP : credit principal — increment atomique (#3.4).
    const afterTopup = await tx.user.update({
      where: { id: opts.userId },
      data: {
        walletCents: { increment: opts.amountCents },
        walletLastActivityAt: new Date(),
      },
      select: { walletCents: true },
    });
    let finalBalance = afterTopup.walletCents;
    await tx.walletTransaction.create({
      data: {
        userId: opts.userId,
        kind: 'TOPUP',
        amountCents: opts.amountCents,
        balanceAfterCents: finalBalance,
        paymentIntentId: opts.paymentIntentId,
        description: `Topup Stripe ${(opts.amountCents / 100).toFixed(2)} $`.slice(0, 500),
      },
    });

    // 2. TOPUP_BONUS si applicable, dans la même tx.
    if (opts.bonusCents > 0 && opts.tierLabel) {
      const afterBonus = await tx.user.update({
        where: { id: opts.userId },
        data: { walletCents: { increment: opts.bonusCents } },
        select: { walletCents: true },
      });
      finalBalance = afterBonus.walletCents;
      await tx.walletTransaction.create({
        data: {
          userId: opts.userId,
          kind: 'TOPUP_BONUS',
          amountCents: opts.bonusCents,
          balanceAfterCents: finalBalance,
          paymentIntentId: opts.paymentIntentId,
          description: `Bonus tier "${opts.tierLabel}" : +${(opts.bonusCents / 100).toFixed(2)} $`.slice(0, 500),
        },
      });
    }

    log.info({
      userId: opts.userId,
      topupCents: opts.amountCents,
      bonusCents: opts.bonusCents,
      tierLabel: opts.tierLabel,
      balanceAfter: finalBalance,
    }, 'wallet topup processed atomically');

    return {
      totalCreditCents: opts.amountCents + opts.bonusCents,
      balanceAfterCents: finalBalance,
    };
  });
}
