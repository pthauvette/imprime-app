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
    const user = await tx.user.findUnique({
      where: { id: opts.userId },
      select: { walletCents: true },
    });
    if (!user) throw new Error(`User ${opts.userId} introuvable`);

    const newBalance = user.walletCents + opts.amountCents;
    if (newBalance < 0 && opts.kind !== 'ADMIN_ADJUSTMENT') {
      throw new Error(
        `Wallet overdraft refusé : user ${opts.userId} a ${user.walletCents} cents, tentative debit ${opts.amountCents}`,
      );
    }

    await tx.user.update({
      where: { id: opts.userId },
      data: {
        walletCents: newBalance,
        // Round 19 #3 — bump l'activity clock pour rolling expiration
        // (12 mois inactif → expire via cron). Reset le warning aussi
        // pour les EXPIRY (sinon on re-warn next cycle alors qu'on vient
        // d'expirer).
        walletLastActivityAt: new Date(),
        ...(opts.kind === 'EXPIRY' && { walletExpiryWarningAt: null }),
      },
    });

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
    }, 'wallet tx recorded');

    return { balanceAfterCents: newBalance, txId: txRow.id };
  });
}

/**
 * Process un topup complet : record le TOPUP + le TOPUP_BONUS si tier.
 * 2 rows dans le ledger (audit clair : "voici ton vrai paiement, voici le bonus").
 */
export async function processWalletTopup(opts: {
  userId: string;
  amountCents: number;
  paymentIntentId: string;
  bonusCents: number;
  tierLabel: string | null;
}): Promise<{ totalCreditCents: number; balanceAfterCents: number }> {
  // 1. Le vrai topup
  await recordWalletTx({
    userId: opts.userId,
    kind: 'TOPUP',
    amountCents: opts.amountCents,
    paymentIntentId: opts.paymentIntentId,
    description: `Topup Stripe ${(opts.amountCents / 100).toFixed(2)} $`,
  });

  // 2. Le bonus séparé pour audit clair
  let final;
  if (opts.bonusCents > 0 && opts.tierLabel) {
    final = await recordWalletTx({
      userId: opts.userId,
      kind: 'TOPUP_BONUS',
      amountCents: opts.bonusCents,
      paymentIntentId: opts.paymentIntentId,
      description: `Bonus tier "${opts.tierLabel}" : +${(opts.bonusCents / 100).toFixed(2)} $`,
    });
  } else {
    // Pas de bonus → on récupère juste le balance courant
    const u = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { walletCents: true },
    });
    final = { balanceAfterCents: u?.walletCents ?? 0, txId: '' };
  }

  return {
    totalCreditCents: opts.amountCents + opts.bonusCents,
    balanceAfterCents: final.balanceAfterCents,
  };
}
