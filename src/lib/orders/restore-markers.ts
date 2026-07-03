/**
 * Marqueurs durables de compensation de restauration de crédit (Audit 2026-07 #3).
 *
 * Quand une restauration de crédit (wallet/referral) échoue APRÈS qu'un refund
 * Stripe a déjà réussi, on ne throw PAS (invariant : ne jamais rollback un vrai
 * remboursement pour de la compta). Historiquement on se contentait d'une alerte
 * critique + remédiation manuelle. Désormais on écrit AUSSI un marqueur durable
 * `OrderEvent` : le cron `restore-compensation` le balaye et rejoue le restore
 * (idempotent) jusqu'au succès, sans jamais toucher au statut de l'Order.
 *
 * Module SANS dépendance vers les helpers de restore (évite un cycle d'import :
 * les helpers importent d'ici ; le cron importe d'ici ET les helpers).
 */
import { prisma } from '@/lib/db';

export const WALLET_RESTORE_PENDING = 'WALLET_RESTORE_PENDING';
export const REFERRAL_RESTORE_PENDING = 'REFERRAL_RESTORE_PENDING';
/** Préfixe du marqueur d'escalade (dédup l'alerte critique à UNE fois par Order/type). */
export const RESTORE_ESCALATED = 'RESTORE_COMPENSATION_ESCALATED';

export type RestorePendingKind = typeof WALLET_RESTORE_PENDING | typeof REFERRAL_RESTORE_PENDING;

export interface RestorePendingData {
  amountCents: number;
  refundId?: string;
  error?: string;
}

/**
 * Écrit un marqueur « restauration en attente » — IDEMPOTENT (un seul par
 * Order/kind) et BEST-EFFORT (si l'insert échoue, on log seulement : l'alerte
 * critique émise en amont reste le filet). Ne throw jamais.
 */
export async function recordRestorePending(
  kind: RestorePendingKind,
  orderId: string,
  data: RestorePendingData,
): Promise<void> {
  try {
    const existing = await prisma.orderEvent.findFirst({
      where: { orderId, kind },
      select: { id: true },
    });
    if (existing) return;
    await prisma.orderEvent.create({
      data: { orderId, kind, data: JSON.stringify(data).slice(0, 10_000) },
    });
  } catch (err) {
    const { logStripe } = await import('@/lib/logger');
    logStripe.error(
      { err, orderId, kind },
      'recordRestorePending échoué (best-effort — l\'alerte critique reste le filet)',
    );
  }
}

/** Lit le refundId stocké dans le `data` JSON d'un marqueur (tolérant). */
export function readRefundId(data: string | null): string | undefined {
  if (!data) return undefined;
  try {
    const parsed = JSON.parse(data) as { refundId?: unknown };
    return typeof parsed.refundId === 'string' ? parsed.refundId : undefined;
  } catch {
    return undefined;
  }
}
