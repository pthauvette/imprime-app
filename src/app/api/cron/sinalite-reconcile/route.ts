/**
 * GET /api/cron/sinalite-reconcile
 *
 * finding [39], docs/experience-client-2026-07.md : « aucune réconciliation
 * — si le webhook Sinalite est manqué, la commande reste figée
 * indéfiniment. » `order-sla-alerts` (existant) ALERTE l'admin sur les
 * commandes bloquées > 48h, mais ne corrige rien — un humain doit encore
 * aller vérifier et rejouer le webhook manuellement. Ce cron FERME le trou :
 * il interroge Sinalite pour le VRAI statut et rejoue le webhook lui-même
 * si le statut a divergé.
 *
 * Sécurité : inerte par défaut (SINALITE_RECONCILE_ENABLED !== '1'), même
 * posture que MCP_CREATE_ORDER_PAY — la forme exacte de sinalite.getOrder()
 * (tracking/carrier inclus dans packageInfo ?) n'a pas pu être vérifiée
 * contre l'API réelle depuis ce dev sandbox (Sinalite en sandbox de toute
 * façon). À activer après vérification manuelle en prod.
 *
 * Réutilise EXACTEMENT le même chemin que le vrai webhook
 * (processSinaliteEvent) — mêmes gardes (transitioned-guard anti double-
 * production), mêmes emails, même refund-si-cancelled — plutôt que de
 * réinventer la logique de transition ici. Un statut Sinalite reconstruit
 * en payload webhook synthétique, c'est un replay, pas un chemin parallèle.
 *
 * Multi-items ambigus (items dont les statuts divergent entre eux) : on
 * SKIP plutôt que deviner — mieux vaut rater un cas que reconcilier sur une
 * hypothèse fausse.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { sinalite, SinaliteError } from '@/lib/sinalite/client';
import { processSinaliteEvent, type SinaliteWebhookPayloadInput } from '@/lib/webhooks/sinalite-process';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STALE_HOURS = 48;
const BATCH = 50;
const RECONCILABLE_STATUSES = ['PAID', 'SUBMITTED', 'IN_PRODUCTION'] as const;

interface ReconciledEntry {
  orderId: string;
  sinaliteOrderId: string;
  from: string;
  to: string;
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'sinalite-reconcile');
  if (denied) return denied;

  const start = Date.now();

  if (process.env.SINALITE_RECONCILE_ENABLED !== '1') {
    const result = { ok: true, latencyMs: Date.now() - start, skipped: 'flag_off' };
    log.info(result, 'cron/sinalite-reconcile: inerte (SINALITE_RECONCILE_ENABLED != 1)');
    await pingCronHealthcheck('sinalite-reconcile', 'success', result);
    await recordCronRun({ name: 'sinalite-reconcile', status: 'success', latencyMs: Date.now() - start, data: result });
    return NextResponse.json(result);
  }

  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000);
  const summary = { eligible: 0, reconciled: 0, unchanged: 0, ambiguous: 0, notFound: 0, failed: 0 };
  const reconciledEntries: ReconciledEntry[] = [];

  try {
    const candidates = await prisma.order.findMany({
      where: {
        status: { in: [...RECONCILABLE_STATUSES] },
        sinaliteOrderId: { not: null },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, status: true, sinaliteOrderId: true },
      orderBy: { updatedAt: 'asc' },
      take: BATCH,
    });
    summary.eligible = candidates.length;

    for (const order of candidates) {
      const sinaliteOrderId = Number(order.sinaliteOrderId);
      try {
        const detail = await sinalite.getOrder(sinaliteOrderId);
        const statuses = new Set(detail.items.map((it) => it.status));
        if (statuses.size !== 1) {
          // Items à des statuts différents (partiel shipped ?) — pas assez
          // sûr pour reconcilier automatiquement.
          summary.ambiguous++;
          log.warn({ orderId: order.id, sinaliteOrderId, statuses: [...statuses] }, 'sinalite-reconcile: statuts items ambigus, skip');
          continue;
        }
        const realStatus = detail.items[0]?.status;
        if (!realStatus) {
          summary.ambiguous++;
          continue;
        }

        const payload: SinaliteWebhookPayloadInput = {
          orderId: sinaliteOrderId,
          status: realStatus,
          timestamp: new Date().toISOString(),
        };
        const ctx: { orderId?: string; unknown?: boolean } = {};
        await processSinaliteEvent(payload, ctx);

        // processSinaliteEvent est idempotent (transitioned-guard) : si le
        // statut réel == statut DB, il no-op silencieusement. On distingue
        // les deux cas pour le résumé admin en relisant l'order après coup.
        const after = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
        if (after && after.status !== order.status) {
          summary.reconciled++;
          reconciledEntries.push({
            orderId: order.id,
            sinaliteOrderId: String(sinaliteOrderId),
            from: order.status,
            to: after.status,
          });
        } else {
          summary.unchanged++;
        }
      } catch (err) {
        if (err instanceof SinaliteError && err.status === 404) {
          summary.notFound++;
          log.warn({ orderId: order.id, sinaliteOrderId }, 'sinalite-reconcile: commande introuvable chez Sinalite');
          continue;
        }
        summary.failed++;
        log.error({ err, orderId: order.id, sinaliteOrderId }, 'sinalite-reconcile: échec pour cette commande, continue');
      }
    }

    // Résumé admin — seulement si quelque chose a bougé (pas de bruit si
    // le batch est propre).
    if (reconciledEntries.length > 0) {
      const adminEmailsRaw = process.env.ADMIN_EMAILS;
      if (adminEmailsRaw) {
        const recipients = adminEmailsRaw.split(',').map((s) => s.trim()).filter(Boolean);
        const rows = reconciledEntries
          .map((e) => `<tr>
            <td style="padding:6px 10px;border-bottom:1px solid #eee"><a href="https://plio.ca/admin/orders/${e.orderId}">${e.orderId.slice(-6).toUpperCase()}</a></td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee">${e.from} → ${e.to}</td>
          </tr>`)
          .join('\n');
        const bodyHtml = `
          <p>${reconciledEntries.length} commande${reconciledEntries.length > 1 ? 's' : ''} rattrapée${reconciledEntries.length > 1 ? 's' : ''} automatiquement — le webhook Sinalite avait été manqué.</p>
          <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:12px">
            <thead><tr style="background:#f5f5f5"><th style="padding:8px 10px;text-align:left">Order</th><th style="padding:8px 10px;text-align:left">Transition</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        `;
        for (const to of recipients) {
          try {
            await sendAdminCustomMessageEmail({
              to,
              replyTo: to,
              vars: {
                ORDER_ID: '',
                ORDER_URL: 'https://plio.ca/admin/orders',
                SUBJECT: `↻ ${reconciledEntries.length} commande${reconciledEntries.length > 1 ? 's' : ''} rattrapée${reconciledEntries.length > 1 ? 's' : ''} (webhook manqué)`,
                PREVIEW: `Réconciliation automatique Sinalite`,
                BODY_HTML: bodyHtml,
                SENDER_NAME: 'Plio Sinalite Reconcile',
                SENDER_EMAIL: 'noreply@plio.ca',
              },
            });
          } catch (err) {
            log.warn({ err, to }, 'cron/sinalite-reconcile: send admin summary fail');
          }
        }
      }
    }

    const result = { ok: true, latencyMs: Date.now() - start, summary };
    log.info(result, 'cron/sinalite-reconcile done');
    await pingCronHealthcheck('sinalite-reconcile', 'success', summary);
    await recordCronRun({ name: 'sinalite-reconcile', status: 'success', latencyMs: Date.now() - start, data: summary });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/sinalite-reconcile failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    await pingCronHealthcheck('sinalite-reconcile', 'fail', { error: errMsg });
    await recordCronRun({
      name: 'sinalite-reconcile',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
      data: { summary },
    });
    return NextResponse.json({ ok: false, error: errMsg, latencyMs: Date.now() - start, summary }, { status: 500 });
  }
}
