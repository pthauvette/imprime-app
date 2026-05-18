/**
 * Award du crédit de parrainage à la 1ère commande payée du filleul.
 *
 * Appelé depuis le webhook Stripe payment_intent.succeeded, en best-effort
 * après markOrderPaid. Si quelque chose foire (référent inexistant, etc.),
 * on log et on n'interrompt pas le flow paiement.
 *
 * Atomicité : transaction Prisma qui incrémente les 2 balances + create
 * le ReferralReward. L'@unique sur refereeUserId garantit qu'un même user
 * ne peut être filleul qu'une seule fois (idempotent sur replay webhook).
 */

import { prisma } from '@/lib/db';
import { findReferrerByCode, REFERRAL_REWARD_CENTS } from './code';
import { logAuth as log } from '@/lib/logger';

export interface AwardResult {
  awarded: boolean;
  reason?: string;
  referrerId?: string;
  amountCents?: number;
}

/**
 * Tente d'awarder le crédit pour cet order. Idempotent : si le filleul a
 * déjà un ReferralReward, no-op silencieux.
 *
 * Critères :
 *  - L'user a un referredByCode (capturé via cookie au signup)
 *  - Le code map à un User existant (différent du filleul lui-même)
 *  - C'est sa 1ère commande PAID (count des orders status != PENDING avant
 *    celle-ci doit être ≤ 1 — l'order courante est déjà PAID après
 *    markOrderPaid donc count == 1 sur 1ère).
 */
export async function awardReferralCreditIfEligible(input: {
  userId: string;
  orderId: string;
}): Promise<AwardResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, referredByCode: true },
  });
  if (!user) return { awarded: false, reason: 'user-not-found' };
  if (!user.referredByCode) return { awarded: false, reason: 'no-referrer' };

  // Idempotence : vérifie qu'on n'a pas déjà créé un reward pour ce filleul
  const existing = await prisma.referralReward.findUnique({
    where: { refereeUserId: user.id },
  });
  if (existing) {
    return { awarded: false, reason: 'already-rewarded' };
  }

  const referrer = await findReferrerByCode(user.referredByCode);
  if (!referrer) return { awarded: false, reason: 'referrer-not-found' };
  if (referrer.id === user.id) return { awarded: false, reason: 'self-referral' };

  // Compte les orders PAID/SUBMITTED/etc du filleul (= toutes sauf PENDING).
  // L'order courante vient juste d'être markée PAID, donc count == 1 sur 1ère.
  const paidOrdersCount = await prisma.order.count({
    where: {
      userId: user.id,
      status: { notIn: ['PENDING', 'FAILED', 'CANCELLED'] },
    },
  });
  if (paidOrdersCount > 1) {
    return { awarded: false, reason: 'not-first-paid-order' };
  }

  const amount = REFERRAL_REWARD_CENTS;

  // Transaction atomique : créer le reward + incrémenter les 2 balances
  try {
    await prisma.$transaction([
      prisma.referralReward.create({
        data: {
          referrerId: referrer.id,
          refereeUserId: user.id,
          refereeOrderId: input.orderId,
          creditCents: amount,
          status: 'CREDITED',
          creditedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: referrer.id },
        data: { referralCreditCents: { increment: amount } },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { referralCreditCents: { increment: amount } },
      }),
    ]);
    log.info({
      referrerId: referrer.id, refereeId: user.id, orderId: input.orderId, amount,
    }, 'referral credit awarded');
    return { awarded: true, referrerId: referrer.id, amountCents: amount };
  } catch (err) {
    log.error({ err, refereeId: user.id }, 'referral award failed');
    return { awarded: false, reason: 'tx-failed' };
  }
}
