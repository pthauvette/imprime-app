/**
 * Cron `restore-compensation` (Audit 2026-07 #3) — rejoue les restaurations de
 * crédit wallet/referral laissées EN ATTENTE quand la compta DB a échoué APRÈS
 * un refund Stripe réussi (double-panne rare : Sinalite échoue + write DB échoue).
 *
 * SÛRETÉ : ce balayage n'appelle QUE les helpers de restauration, déjà
 * idempotents (garde `REFUND` WalletTransaction pour le wallet, garde
 * `REFERRAL_CREDIT_RESTORED` OrderEvent pour le referral). Il ne re-finalise
 * rien, ne re-soumet rien à Sinalite, ne touche JAMAIS `order.status` — donc
 * aucune interaction avec la garde anti-double-production / transitioned. Le
 * pire entrelacement (cron pendant une restauration admin manuelle) est absorbé
 * par l'idempotence (no-op).
 *
 * Un item « en attente » = un marqueur PENDING sans sa condition de succès :
 *   - wallet   : WALLET_RESTORE_PENDING  ET aucune WalletTransaction REFUND
 *   - referral : REFERRAL_RESTORE_PENDING ET aucun OrderEvent REFERRAL_CREDIT_RESTORED
 * Dès que le restore réussit, la condition de succès est remplie → l'item sort
 * naturellement du champ (le marqueur PENDING reste comme trace d'audit).
 *
 * Escalade : si un item est bloqué > escalateAfterMs malgré les retries, une
 * alerte critique est émise UNE SEULE fois (dédup via un marqueur ESCALATED).
 */
import { prisma } from '@/lib/db';
import { restoreWalletCreditOnFullRefund } from '@/lib/wallet/operations';
import { restoreReferralCreditOnFullRefund } from '@/lib/referrals/restore';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import {
  WALLET_RESTORE_PENDING,
  REFERRAL_RESTORE_PENDING,
  RESTORE_ESCALATED,
  readRefundId,
} from '@/lib/orders/restore-markers';

/** Le crédit référence de succès du referral (posé par le helper au restore). */
const REFERRAL_CREDIT_RESTORED = 'REFERRAL_CREDIT_RESTORED';
const DEFAULT_ESCALATE_MS = 6 * 60 * 60 * 1000; // 6 h
const MAX_PER_RUN = 500;

export interface RestoreSweepStats {
  pending: number;
  resolved: number;
  stillFailing: number;
  escalated: number;
}
export interface RestoreCompensationResult {
  wallet: RestoreSweepStats;
  referral: RestoreSweepStats;
}

export async function runRestoreCompensation(opts: {
  nowMs: number;
  escalateAfterMs?: number;
}): Promise<RestoreCompensationResult> {
  const escalateAfterMs = opts.escalateAfterMs ?? DEFAULT_ESCALATE_MS;
  const wallet = await sweepWallet(opts.nowMs, escalateAfterMs);
  const referral = await sweepReferral(opts.nowMs, escalateAfterMs);
  return { wallet, referral };
}

async function walletRestored(orderId: string): Promise<boolean> {
  const done = await prisma.walletTransaction.findFirst({
    where: { orderId, kind: 'REFUND' },
    select: { id: true },
  });
  return !!done;
}

async function referralRestored(orderId: string): Promise<boolean> {
  const done = await prisma.orderEvent.findFirst({
    where: { orderId, kind: REFERRAL_CREDIT_RESTORED },
    select: { id: true },
  });
  return !!done;
}

async function sweepWallet(nowMs: number, escalateAfterMs: number): Promise<RestoreSweepStats> {
  const pending = await prisma.orderEvent.findMany({
    where: { kind: WALLET_RESTORE_PENDING },
    select: { orderId: true, createdAt: true, data: true },
    distinct: ['orderId'],
    orderBy: { createdAt: 'asc' },
    take: MAX_PER_RUN,
  });
  let resolved = 0;
  let stillFailing = 0;
  let escalated = 0;
  for (const ev of pending) {
    if (await walletRestored(ev.orderId)) continue; // déjà restauré → sorti du champ
    const order = await prisma.order.findUnique({
      where: { id: ev.orderId },
      select: { id: true, userId: true, walletCreditAppliedCents: true },
    });
    if (!order) continue; // Order supprimée → rien à faire

    const restored = await restoreWalletCreditOnFullRefund({
      order,
      refundId: readRefundId(ev.data),
      suppressAlert: true,
    });
    if (restored > 0 || (await walletRestored(ev.orderId))) {
      // restored>0 = ce run l'a fait ; sinon re-check ground-truth (course avec un
      // autre chemin qui l'aurait restauré) → resolved, pas d'escalade à tort.
      resolved++;
      continue;
    }
    stillFailing++;
    if (nowMs - ev.createdAt.getTime() > escalateAfterMs) {
      if (await escalateOnce(ev.orderId, 'wallet', order.userId)) escalated++;
    }
  }
  return { pending: pending.length, resolved, stillFailing, escalated };
}

async function sweepReferral(nowMs: number, escalateAfterMs: number): Promise<RestoreSweepStats> {
  const pending = await prisma.orderEvent.findMany({
    where: { kind: REFERRAL_RESTORE_PENDING },
    select: { orderId: true, createdAt: true, data: true },
    distinct: ['orderId'],
    orderBy: { createdAt: 'asc' },
    take: MAX_PER_RUN,
  });
  let resolved = 0;
  let stillFailing = 0;
  let escalated = 0;
  for (const ev of pending) {
    if (await referralRestored(ev.orderId)) continue;
    const order = await prisma.order.findUnique({
      where: { id: ev.orderId },
      select: { id: true, userId: true, referralCreditAppliedCents: true },
    });
    if (!order) continue;

    const restored = await restoreReferralCreditOnFullRefund({
      order,
      refundId: readRefundId(ev.data),
      suppressAlert: true,
    });
    if (restored > 0 || (await referralRestored(ev.orderId))) {
      resolved++;
      continue;
    }
    stillFailing++;
    if (nowMs - ev.createdAt.getTime() > escalateAfterMs) {
      if (await escalateOnce(ev.orderId, 'referral', order.userId)) escalated++;
    }
  }
  return { pending: pending.length, resolved, stillFailing, escalated };
}

/**
 * Émet UNE alerte critique par Order/type (dédup via un marqueur ESCALATED) —
 * évite le spam d'alertes à chaque run tant qu'un item reste bloqué.
 * @returns true si une alerte a réellement été émise (première escalade).
 */
async function escalateOnce(
  orderId: string,
  type: 'wallet' | 'referral',
  userId: string,
): Promise<boolean> {
  const kind = `${RESTORE_ESCALATED}_${type.toUpperCase()}`;
  const existing = await prisma.orderEvent.findFirst({ where: { orderId, kind }, select: { id: true } });
  if (existing) return false;
  await sendCriticalAlert({
    severity: 'critical',
    title: `Compensation ${type} bloquée > 6 h`,
    body:
      `La restauration ${type} de la commande ${orderId} échoue depuis plus de 6 h ` +
      `malgré les retries du cron restore-compensation. Intervention manuelle requise : ` +
      `/admin/users/${userId}.`,
    context: { orderId, type, userId },
  });
  // Marqueur de dédup — best-effort (si l'insert échoue, on ré-alertera au prochain run).
  await prisma.orderEvent.create({ data: { orderId, kind } }).catch(() => {});
  return true;
}
