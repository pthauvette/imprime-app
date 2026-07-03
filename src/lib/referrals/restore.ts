/**
 * restoreReferralCreditOnFullRefund — restaure le crédit referral débité à une
 * commande lors d'un FULL refund/cancel (Audit v2 #3.1).
 *
 * Le crédit referral est débité à la CONFIRMATION du paiement
 * (markOrderPaidWithWalletDebit, #3.1). Symétriquement, un remboursement total
 * doit le restaurer — sinon le client perd son crédit marketing alors que la
 * commande est annulée. Pendant pour le wallet (restoreWalletCreditOnFullRefund).
 *
 * Idempotent : marqueur OrderEvent `REFERRAL_CREDIT_RESTORED` → ne restaure
 * qu'UNE fois par commande (safe pour retry webhook + double-clic admin).
 * Non-fatal : un échec alerte mais ne throw pas (le refund Stripe a déjà
 * réussi ; on ne rollback jamais un vrai remboursement pour de la compta).
 *
 * @returns cents effectivement restaurés (0 si rien à faire ou déjà restauré).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const RESTORE_EVENT_KIND = 'REFERRAL_CREDIT_RESTORED';

export async function restoreReferralCreditOnFullRefund(input: {
  order: { id: string; userId: string; referralCreditAppliedCents: number };
  /** Acteur : id admin, ou undefined pour le système (webhook auto-refund). */
  actorId?: string;
  /** ID du refund Stripe, pour le contexte d'alerte/audit. */
  refundId?: string;
  /** Cron restore-compensation : supprime l'alerte critique par-appel (le cron
   *  escalade lui-même, une seule fois, après N heures d'échecs). */
  suppressAlert?: boolean;
}): Promise<number> {
  const { order } = input;
  if (order.referralCreditAppliedCents <= 0) return 0;

  // Fast-path idempotence (HORS verrou) : si déjà restauré, no-op sans tx. La garde
  // AUTORITAIRE est re-vérifiée SOUS verrou dans la tx ci-dessous (anti-course).
  const pre = await prisma.orderEvent.findFirst({
    where: { orderId: order.id, kind: RESTORE_EVENT_KIND },
    select: { id: true },
  });
  if (pre) return 0;

  try {
    return await prisma.$transaction(async (tx) => {
      // Anti-double-crédit sous concurrence (Audit 2026-07 #3 — cron
      // restore-compensation en overlap / double-clic admin). Verrou pessimiste sur
      // la row User (pattern processWalletTopup) → findFirst→create ATOMIQUE.
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "User" WHERE id = ${order.userId} FOR UPDATE`,
      );
      if (locked.length === 0) return 0; // user supprimé → rien à restaurer
      // Re-check AUTORITAIRE sous verrou : un run concurrent a pu committer entre-temps.
      const existing = await tx.orderEvent.findFirst({
        where: { orderId: order.id, kind: RESTORE_EVENT_KIND },
        select: { id: true },
      });
      if (existing) return 0;
      await tx.user.update({
        where: { id: order.userId },
        data: { referralCreditCents: { increment: order.referralCreditAppliedCents } },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          kind: RESTORE_EVENT_KIND,
          data: JSON.stringify({
            amountCents: order.referralCreditAppliedCents,
            refundId: input.refundId,
            actorId: input.actorId,
          }),
        },
      });
      return order.referralCreditAppliedCents;
    });
  } catch (err) {
    const { logStripe } = await import('@/lib/logger');
    logStripe.error(
      { err, orderId: order.id, referralAppliedCents: order.referralCreditAppliedCents },
      'referral restore on refund failed (non-fatal — compensation auto par cron restore-compensation)',
    );
    // Audit 2026-07 #3 — marqueur durable idempotent : le cron restore-compensation
    // rejoue ce restore (idempotent via le garde REFERRAL_CREDIT_RESTORED). Best-effort.
    const { recordRestorePending, REFERRAL_RESTORE_PENDING } = await import('@/lib/orders/restore-markers');
    await recordRestorePending(REFERRAL_RESTORE_PENDING, order.id, {
      amountCents: order.referralCreditAppliedCents,
      refundId: input.refundId,
      error: err instanceof Error ? err.message : String(err),
    });
    if (!input.suppressAlert) {
      const { sendCriticalAlert } = await import('@/lib/alerting/slack');
      await sendCriticalAlert({
        severity: 'critical',
        title: 'Referral credit restore on refund FAILED',
        body: `Refund OK mais crédit referral non restauré. Le cron restore-compensation va rejouer automatiquement ; sinon ajuste /admin/users/${order.userId}.`,
        context: {
          orderId: order.id,
          refundId: input.refundId,
          referralAppliedCents: order.referralCreditAppliedCents,
          error: err instanceof Error ? err.message : 'unknown',
        },
      });
    }
    return 0;
  }
}
