/**
 * GET /api/cron/cleanup
 *
 * Cleanup quotidien des rows expirées :
 *   - Draft  (wizard order in-progress) : delete WHERE expiresAt < now()
 *   - DesignDraft (design pdfme) : delete WHERE orderId IS NULL ET
 *     updatedAt < (now - 30j). On garde TOUS les designs liés à une order
 *     pour audit/réimpression.
 *   - Mode B MCP (paiement headless) : filet de sécurité au-delà du webhook
 *     checkout.session.expired. (a) annule les Orders `mcp_%` restées PENDING
 *     > 2h (Session Stripe expirée à 60 min) ; (b) résout les claims
 *     McpOrderIntent success=false périmés : delete si l'Order est absente/
 *     terminale-non-payée (libère un retry), mais success=true si l'Order a été
 *     PAYÉE (crash rare après Session avant complete) — JAMAIS supprimer un claim
 *     d'Order payée sinon un retry recréerait une 2e commande (double charge).
 *
 * Auth : header `Authorization: Bearer ${CRON_SECRET}` (env var).
 * Sans secret configuré, l'endpoint refuse tout sauf en dev (NODE_ENV).
 *
 * Schedule : UptimeRobot HTTP monitor "keyword" config sur cette URL avec
 * le header Authorization custom, intervalle 24h. Alternative : AWS
 * EventBridge → API Gateway → cette route.
 *
 * Retourne JSON avec compte de rows supprimées par modèle + latencyMs.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun, cleanupOldCronRuns } from '@/lib/cron/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DESIGN_DRAFT_TTL_DAYS = 30;
/** Au-delà, un Order Mode B PENDING (Session expire à 60 min) est un orphelin sûr à annuler. */
const MCP_ORPHAN_TTL_HOURS = 2;
/** M2/M3 — au-delà, un Order WEB PENDING (PI jamais confirmé) est abandonné → on libère
 *  les crédits réservés au create. 24h = ne coupe pas un paiement lent légitime (FORK 3). */
const WEB_ORDER_ABANDON_TTL_HOURS = 24;
/** Statuts où l'achat a RÉUSSI → ne JAMAIS supprimer le claim (sinon retry = double commande). */
const PAID_LIKE_STATUSES = ['PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'];

export async function GET(req: NextRequest) {
  // Auth — refuse si pas configuré (prod) ou si header manque/mismatch
  const denied = requireCronAuth(req, 'cleanup');
  if (denied) return denied;

  const start = Date.now();
  const now = new Date();
  const designCutoff = new Date(now.getTime() - DESIGN_DRAFT_TTL_DAYS * 24 * 3600 * 1000);
  const mcpCutoff = new Date(now.getTime() - MCP_ORPHAN_TTL_HOURS * 3600 * 1000);
  const webCutoff = new Date(now.getTime() - WEB_ORDER_ABANDON_TTL_HOURS * 3600 * 1000);

  try {
    const [drafts, designs, oldCronRuns, mcpNullClaims] = await Promise.all([
      prisma.draft.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.designDraft.deleteMany({
        where: {
          orderId: null,
          updatedAt: { lt: designCutoff },
        },
      }),
      // Aussi : cleanup les rows CronRun > 30 jours pour pas que la table
      // grossisse à l'infini (~120 rows/jour × 30 = 3600 max).
      cleanupOldCronRuns(30).catch(() => 0),
      // Mode B (b-1) : claims poisoned SANS Order (crash avant createReservedOrder) → delete (sûr).
      prisma.mcpOrderIntent.deleteMany({
        where: { success: false, orderId: null, createdAt: { lt: mcpCutoff } },
      }),
    ]);

    // M2/M3 — libère (restaure) les crédits wallet/referral RÉSERVÉS au create des Orders
    //   abandonnées. Per-order (pas de updateMany bulk) : releaseReservedCreditsOnCancel fait
    //   la transition PENDING→CANCELLED gardée (count===1) ET la restauration, exactement-une-fois.
    //   Mode B : PENDING mcp_ > 2h (filet au-delà de checkout.session.expired). Web : PENDING
    //   > 24h (PI jamais confirmé) — le SEUL chemin qui libère un abandon web (aucun event Stripe).
    const { releaseReservedCreditsOnCancel } = await import('@/lib/orders/credit-reservation');
    const releaseAbandoned = async (where: Prisma.OrderWhereInput): Promise<number> => {
      const abandoned = await prisma.order.findMany({ where, select: { id: true } });
      let n = 0;
      for (const o of abandoned) {
        try {
          const r = await releaseReservedCreditsOnCancel({ orderId: o.id, reason: 'cron-cleanup' });
          if (r.released) n++;
        } catch (err) {
          // Un échec isolé (ex. user supprimé) ne doit PAS priver les Orders SUIVANTES de
          // libération — c'est le SEUL chemin automatique qui libère un abandon web.
          log.error({ orderId: o.id, err: String(err) }, 'cron: release crédit réservé échoué (les suivants continuent)');
        }
      }
      return n;
    };
    const mcpOrphanOrders = await releaseAbandoned({ paymentIntentId: { startsWith: 'mcp_' }, status: 'PENDING', createdAt: { lt: mcpCutoff } });
    // Web : PENDING (jamais payé) OU FAILED (paiement échoué jamais retenté) > 24h. Sinon un
    //   crédit réservé sur un checkout raté serait gelé à vie (le webhook ne restaure pas au
    //   payment_failed = B1). La page retry rejette les Orders CANCELLED → pas de charge après
    //   annulation sur un retry tardif.
    const webOrphanOrders = await releaseAbandoned({ paymentIntentId: { not: { startsWith: 'mcp_' } }, status: { in: ['PENDING', 'FAILED'] }, createdAt: { lt: webCutoff } });

    // Mode B (b-2) : claims success=false AVEC un orderId. On distingue selon le
    // statut de l'Order pour ne JAMAIS supprimer le claim d'une Order payée.
    const staleWithOrder = await prisma.mcpOrderIntent.findMany({
      where: { success: false, orderId: { not: null }, createdAt: { lt: mcpCutoff } },
      select: { id: true, orderId: true },
    });
    let mcpClaimsDeleted = mcpNullClaims.count;
    let mcpClaimsResolvedPaid = 0;
    if (staleWithOrder.length > 0) {
      const orderIds = staleWithOrder.map((c) => c.orderId!).filter(Boolean);
      const orders = await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, status: true } });
      const statusById = new Map(orders.map((o) => [o.id, o.status]));
      const toDelete: string[] = [];
      const toResolvePaid: string[] = [];
      for (const c of staleWithOrder) {
        const status = statusById.get(c.orderId!);
        if (status && PAID_LIKE_STATUSES.includes(status)) {
          toResolvePaid.push(c.id); // achat réussi → success=true (dedup légitime, pas de double commande)
        } else {
          toDelete.push(c.id); // Order absente / CANCELLED / FAILED / PENDING-orpheline → libère le retry
        }
      }
      if (toDelete.length > 0) {
        const d = await prisma.mcpOrderIntent.deleteMany({ where: { id: { in: toDelete } } });
        mcpClaimsDeleted += d.count;
      }
      if (toResolvePaid.length > 0) {
        const u = await prisma.mcpOrderIntent.updateMany({ where: { id: { in: toResolvePaid } }, data: { success: true } });
        mcpClaimsResolvedPaid = u.count;
      }
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      deleted: {
        drafts: drafts.count,
        designDrafts: designs.count,
        oldCronRuns,
        mcpClaims: mcpClaimsDeleted,
      },
      mcp: {
        orphanOrdersCancelled: mcpOrphanOrders,
        claimsDeleted: mcpClaimsDeleted,
        claimsResolvedPaid: mcpClaimsResolvedPaid,
      },
      // M2/M3 — Orders WEB abandonnées (PENDING > 24h) annulées + crédits restaurés.
      webOrdersReleased: webOrphanOrders,
      cutoffs: {
        drafts: 'expiresAt < now',
        designDrafts: `updatedAt < now - ${DESIGN_DRAFT_TTL_DAYS}d AND orderId is null`,
        cronRuns: 'createdAt < now - 30d',
        mcp: `mcp_ orders/claims < now - ${MCP_ORPHAN_TTL_HOURS}h`,
      },
    };

    log.info(result, 'cron/cleanup ran');
    await pingCronHealthcheck('cleanup', 'success');
    await recordCronRun({
      name: 'cleanup',
      status: 'success',
      latencyMs: Date.now() - start,
      data: result.deleted,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/cleanup failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    await pingCronHealthcheck('cleanup', 'fail', { error: errMsg });
    await recordCronRun({
      name: 'cleanup',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
    });
    return NextResponse.json(
      {
        ok: false,
        error: errMsg,
        latencyMs: Date.now() - start,
      },
      { status: 500 },
    );
  }
}
