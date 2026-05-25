/**
 * Wallet operations — recordTransaction + topup helpers.
 *
 * Toujours utiliser ces helpers (jamais update direct sur User.walletCents)
 * pour garantir que le ledger WalletTransaction est tenu à jour.
 *
 * Transactions atomiques via prisma.$transaction — si l'INSERT ledger
 * fail, l'UPDATE wallet est rollback.
 */

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
 * Process un topup complet : record le TOPUP + le TOPUP_BONUS si tier.
 * 2 rows dans le ledger (audit clair : "voici ton vrai paiement, voici le bonus").
 *
 * Round 37 #1 — Maintenant atomique : les 2 inserts vivent dans la MÊME
 * prisma.$transaction. Avant : si TOPUP commit puis TOPUP_BONUS fail (DB blip,
 * connection close), le user payait pour le bonus tier mais ne le recevait
 * pas (ledger split-brain → support ticket des semaines plus tard).
 */
export async function processWalletTopup(opts: {
  userId: string;
  amountCents: number;
  paymentIntentId: string;
  bonusCents: number;
  tierLabel: string | null;
}): Promise<{ totalCreditCents: number; balanceAfterCents: number }> {
  return prisma.$transaction(async (tx) => {
    // Lookup balance courant 1 fois
    const userBefore = await tx.user.findUnique({
      where: { id: opts.userId },
      select: { walletCents: true },
    });
    if (!userBefore) {
      throw new Error(`User ${opts.userId} introuvable pour wallet topup`);
    }

    // 1. TOPUP : credit principal
    const balanceAfterTopup = userBefore.walletCents + opts.amountCents;
    await tx.user.update({
      where: { id: opts.userId },
      data: {
        walletCents: balanceAfterTopup,
        walletLastActivityAt: new Date(),
      },
    });
    await tx.walletTransaction.create({
      data: {
        userId: opts.userId,
        kind: 'TOPUP',
        amountCents: opts.amountCents,
        balanceAfterCents: balanceAfterTopup,
        paymentIntentId: opts.paymentIntentId,
        description: `Topup Stripe ${(opts.amountCents / 100).toFixed(2)} $`.slice(0, 500),
      },
    });

    let finalBalance = balanceAfterTopup;

    // 2. TOPUP_BONUS si applicable, dans la même tx
    if (opts.bonusCents > 0 && opts.tierLabel) {
      const balanceAfterBonus = balanceAfterTopup + opts.bonusCents;
      await tx.user.update({
        where: { id: opts.userId },
        data: { walletCents: balanceAfterBonus },
      });
      await tx.walletTransaction.create({
        data: {
          userId: opts.userId,
          kind: 'TOPUP_BONUS',
          amountCents: opts.bonusCents,
          balanceAfterCents: balanceAfterBonus,
          paymentIntentId: opts.paymentIntentId,
          description: `Bonus tier "${opts.tierLabel}" : +${(opts.bonusCents / 100).toFixed(2)} $`.slice(0, 500),
        },
      });
      finalBalance = balanceAfterBonus;
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
