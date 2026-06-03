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
import { prisma } from '@/lib/db';

const RESTORE_EVENT_KIND = 'REFERRAL_CREDIT_RESTORED';

export async function restoreReferralCreditOnFullRefund(input: {
  order: { id: string; userId: string; referralCreditAppliedCents: number };
  /** Acteur : id admin, ou undefined pour le système (webhook auto-refund). */
  actorId?: string;
  /** ID du refund Stripe, pour le contexte d'alerte/audit. */
  refundId?: string;
}): Promise<number> {
  const { order } = input;
  if (order.referralCreditAppliedCents <= 0) return 0;

  // Idempotence : si le crédit a déjà été restauré pour cette commande, no-op.
  const existing = await prisma.orderEvent.findFirst({
    where: { orderId: order.id, kind: RESTORE_EVENT_KIND },
    select: { id: true },
  });
  if (existing) return 0;

  try {
    await prisma.$transaction(async (tx) => {
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
    });
    return order.referralCreditAppliedCents;
  } catch (err) {
    const { logStripe } = await import('@/lib/logger');
    logStripe.error(
      { err, orderId: order.id, referralAppliedCents: order.referralCreditAppliedCents },
      'referral restore on refund failed (non-fatal — manual reconcile needed)',
    );
    const { sendCriticalAlert } = await import('@/lib/alerting/slack');
    void sendCriticalAlert({
      severity: 'critical',
      title: 'Referral credit restore on refund FAILED',
      body: `Refund OK mais crédit referral non restauré. Ajuste manuellement /admin/users/${order.userId}.`,
      context: {
        orderId: order.id,
        refundId: input.refundId,
        referralAppliedCents: order.referralCreditAppliedCents,
        error: err instanceof Error ? err.message : 'unknown',
      },
    });
    return 0;
  }
}
