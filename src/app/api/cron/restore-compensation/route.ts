/**
 * GET /api/cron/restore-compensation
 *
 * Audit 2026-07 #3 — rejoue les restaurations de crédit wallet/referral laissées
 * EN ATTENTE (marqueur OrderEvent WALLET_RESTORE_PENDING / REFERRAL_RESTORE_PENDING)
 * quand la compta DB a échoué APRÈS un refund Stripe réussi. Idempotent : ne
 * touche jamais le statut de l'Order, appelle seulement les helpers de restore
 * (déjà idempotents). Escalade une alerte critique (une fois) si un item reste
 * bloqué > 6 h.
 *
 * Auth : header `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule : pinger HTTP externe (UptimeRobot / EventBridge), intervalle ~1 h.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { runRestoreCompensation } from '@/lib/orders/restore-compensation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'restore-compensation');
  if (denied) return denied;

  const start = Date.now();
  try {
    const swept = await runRestoreCompensation({ nowMs: Date.now() });
    const result = { ok: true, latencyMs: Date.now() - start, ...swept };

    log.info(result, 'cron/restore-compensation ran');
    await pingCronHealthcheck('restore-compensation', 'success');
    await recordCronRun({
      name: 'restore-compensation',
      status: 'success',
      latencyMs: Date.now() - start,
      data: {
        walletPending: swept.wallet.pending,
        walletResolved: swept.wallet.resolved,
        walletStillFailing: swept.wallet.stillFailing,
        walletEscalated: swept.wallet.escalated,
        referralPending: swept.referral.pending,
        referralResolved: swept.referral.resolved,
        referralStillFailing: swept.referral.stillFailing,
        referralEscalated: swept.referral.escalated,
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'unknown';
    log.error({ err }, 'cron/restore-compensation failed');
    await pingCronHealthcheck('restore-compensation', 'fail', { error: errMsg });
    await recordCronRun({
      name: 'restore-compensation',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
    });
    return NextResponse.json({ ok: false, error: errMsg, latencyMs: Date.now() - start }, { status: 500 });
  }
}
