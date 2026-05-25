/**
 * Email suppression list (Round 39 #4).
 *
 * Source of truth pour "ne plus jamais envoyer d'email à cette address".
 * Populé par /api/webhooks/ses (SNS bounce/complaint notifications) et
 * éventuellement par une UI admin (manual suppress).
 *
 * queueEmail() check `isSuppressed()` AVANT d'INSERT EmailDelivery — un email
 * suppressed ne crée même pas de row queue (vs throttle qui crée une row
 * status='SKIPPED_THROTTLED'). On veut zéro spend SES + zéro pollution
 * dashboard pour les addresses suppressed.
 */

import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';

export type SuppressionReason = 'HARD_BOUNCE' | 'COMPLAINT' | 'MANUAL';
export type SuppressionSource = 'SES_BOUNCE' | 'SES_COMPLAINT' | 'ADMIN' | 'USER_UNSUB';

/**
 * Returns true si l'address est dans la liste de suppression.
 * Normalise l'email (trim + lowercase) avant la query — match l'INSERT.
 */
export async function isSuppressed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const row = await prisma.emailSuppression.findUnique({
    where: { email: normalized },
    select: { id: true },
  });
  return row !== null;
}

export interface SuppressEmailInput {
  email: string;
  reason: SuppressionReason;
  source: SuppressionSource;
  /** SES Message-ID — preserved pour audit/dedup. */
  sesMessageId?: string;
  /** Free-form JSON-stringified details (bounceType, complaintFeedbackType, etc.). */
  details?: string;
}

/**
 * Add ou met à jour une entrée de suppression. Idempotent : si l'email est
 * déjà dans la table, on met à jour `reason`/`source`/`details` au cas où
 * (ex: SOFT_BOUNCE → COMPLAINT, on veut le signal le plus récent).
 *
 * Returns true si une nouvelle row a été créée, false si update.
 */
export async function suppressEmail(input: SuppressEmailInput): Promise<{ created: boolean }> {
  const normalized = input.email.trim().toLowerCase();
  if (!normalized) {
    log.warn({ input }, 'suppressEmail: empty email — skip');
    return { created: false };
  }

  // upsert pattern : si exists → update les fields ; sinon → create.
  // Note : Prisma upsert reads-then-writes en 2 SQL calls. Pour notre volume
  // SES (~quelques bounces/jour max), pas un perf concern.
  const existing = await prisma.emailSuppression.findUnique({
    where: { email: normalized },
    select: { id: true, reason: true },
  });

  if (existing) {
    // Update seulement si le reason ESCALATE (HARD_BOUNCE > COMPLAINT >
    // MANUAL — par priorité de gravité). Pour MVP on prend le plus récent.
    await prisma.emailSuppression.update({
      where: { id: existing.id },
      data: {
        reason: input.reason,
        source: input.source,
        sesMessageId: input.sesMessageId ?? null,
        details: input.details ?? null,
      },
    });
    log.info({ email: normalized, reason: input.reason, source: input.source }, 'email suppression updated');
    return { created: false };
  }

  await prisma.emailSuppression.create({
    data: {
      email: normalized,
      reason: input.reason,
      source: input.source,
      sesMessageId: input.sesMessageId ?? null,
      details: input.details ?? null,
    },
  });
  log.info({ email: normalized, reason: input.reason, source: input.source }, 'email suppression added');
  return { created: true };
}
