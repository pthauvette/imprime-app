/**
 * GET /api/cron/order-sla-alerts
 *
 * Round 34. Cron quotidien qui scan les orders PAID ou SUBMITTED
 * depuis > 48h et email l'admin avec la liste des "stuck" orders.
 *
 * Pourquoi : sans ce signal, un order qui ne reçoit pas son webhook
 * Sinalite (race, network blip, Sinalite down) reste silencieusement
 * en status PAID pour toujours. Le customer attend, l'admin ignore,
 * un mois plus tard support ticket "où est ma commande ?".
 *
 * Logique :
 *   - PAID  depuis > 48h  → SLA viol "pas encore submitted Sinalite"
 *   - SUBMITTED depuis > 48h → SLA viol "Sinalite a accepté mais pas
 *     progress (pas de webhook IN_PRODUCTION/SHIPPED)"
 *   - Si zéro stuck → skip email, juste ping healthcheck OK
 *
 * Schedule : quotidien 10h UTC (après daily-summary à 8h).
 * Réutilise admin-custom-message template avec liste HTML pré-buildée.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SLA_HOURS = 48;
/** Round 39 #5 — Re-alert window. Un order alerté il y a < 7j est skipped.
 *  Après 7j sans résolution, on re-alerté (escalation pour les chroniques). */
const REALERT_AFTER_DAYS = 7;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'order-sla-alerts');
  if (denied) return denied;

  const start = Date.now();
  const adminEmailsRaw = process.env.ADMIN_EMAILS;
  if (!adminEmailsRaw) {
    const result = { ok: true, latencyMs: Date.now() - start, skipped: 'admin_emails_not_configured' };
    log.warn('cron/order-sla-alerts: ADMIN_EMAILS not configured — skip');
    await recordCronRun({ name: 'order-sla-alerts', status: 'success', latencyMs: Date.now() - start, data: result });
    return NextResponse.json(result);
  }
  const recipients = adminEmailsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  const cutoff = new Date(Date.now() - SLA_HOURS * 3600 * 1000);
  const realertCutoff = new Date(Date.now() - REALERT_AFTER_DAYS * 24 * 3600 * 1000);

  try {
    // Stuck orders : PAID ou SUBMITTED depuis > 48h sans avancer
    // On utilise paidAt comme reference (timestamp d'entrée en PAID).
    // Pour SUBMITTED, on utilise le dernier OrderEvent SINALITE_SUBMITTED
    // mais c'est cher — on approxime via paidAt + 48h (acceptable car
    // la fenêtre PAID → SUBMITTED est généralement < 1h, donc si
    // paidAt > 48h ago et toujours SUBMITTED, c'est suspect).
    //
    // Round 39 #5 — Dedup: on n'inclut QUE les orders pas encore alertées
    // (slaAlertedAt IS NULL) OU alertées il y a plus de 7j (re-escalation).
    // Sinon, un order stuck 5j = 5 emails identiques admin → fatigue.
    const stuckOrders = await prisma.order.findMany({
      where: {
        status: { in: ['PAID', 'SUBMITTED'] },
        paidAt: { lt: cutoff },
        OR: [
          { slaAlertedAt: null },
          { slaAlertedAt: { lt: realertCutoff } },
        ],
      },
      select: {
        id: true,
        status: true,
        paidAt: true,
        amountCents: true,
        currency: true,
        shipName: true,
        shipCity: true,
        shipProvince: true,
        productSummary: true,
        slaAlertedAt: true,
        user: { select: { email: true } },
      },
      orderBy: { paidAt: 'asc' },
      take: 100, // cap pour éviter email géant (déjà très alarmant à 100+)
    });

    if (stuckOrders.length === 0) {
      const result = { ok: true, latencyMs: Date.now() - start, stuckCount: 0, recipients: recipients.length, sent: 0 };
      log.info(result, 'cron/order-sla-alerts ran (zero stuck)');
      await pingCronHealthcheck('order-sla-alerts', 'success', result);
      await recordCronRun({ name: 'order-sla-alerts', status: 'success', latencyMs: Date.now() - start, data: result });
      return NextResponse.json(result);
    }

    // Build BODY_HTML — liste des orders avec age en heures
    const now = Date.now();
    const rows = stuckOrders
      .map((o) => {
        const ageHrs = o.paidAt ? Math.floor((now - o.paidAt.getTime()) / 3600 / 1000) : 0;
        const amount = (o.amountCents / 100).toFixed(2);
        const orderShort = o.id.slice(-6).toUpperCase();
        const userEmail = o.user?.email ?? 'guest';
        const ship = `${o.shipName}, ${o.shipCity} ${o.shipProvince}`;
        // Round 39 #5 — flag les re-alerts pour que l'admin distingue le
        // chronique (déjà alerté) du nouveau (1ère alerte).
        const realertBadge = o.slaAlertedAt
          ? `<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:11px;margin-left:6px">↻ re-alert</span>`
          : '';
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee"><a href="https://plio.ca/admin/orders/${o.id}">${orderShort}</a>${realertBadge}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${o.status}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${ageHrs > 96 ? '#dc2626' : '#D97706'};font-weight:600">${ageHrs}h</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${amount} ${o.currency}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${userEmail}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${ship}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#666">${o.productSummary ?? '—'}</td>
        </tr>`;
      })
      .join('\n');

    const bodyHtml = `
      <p>${stuckOrders.length} commande${stuckOrders.length > 1 ? 's' : ''} bloquée${stuckOrders.length > 1 ? 's' : ''} depuis plus de ${SLA_HOURS}h en status PAID ou SUBMITTED. Vérifie le webhook Sinalite.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:12px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px 10px;text-align:left">Order</th>
            <th style="padding:8px 10px;text-align:left">Status</th>
            <th style="padding:8px 10px;text-align:left">Age</th>
            <th style="padding:8px 10px;text-align:left">Montant</th>
            <th style="padding:8px 10px;text-align:left">User</th>
            <th style="padding:8px 10px;text-align:left">Livraison</th>
            <th style="padding:8px 10px;text-align:left">Produit</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;font-size:12px;color:#666">
        Action recommandée :<br>
        1. Vérifier le statut Sinalite réel via leur portal/API<br>
        2. Si Sinalite OK mais Plio status non sync, replay le webhook (admin/webhooks)<br>
        3. Si Sinalite n'a jamais reçu, manuellement re-submit depuis /admin/orders/[id]
      </p>
    `;

    // Fail-soft per-recipient : si 1 send fail, les autres tentent quand même.
    let sent = 0;
    for (const to of recipients) {
      try {
        await sendAdminCustomMessageEmail({
          to,
          replyTo: to,
          vars: {
            ORDER_ID: '',
            ORDER_URL: 'https://plio.ca/admin/orders',
            SUBJECT: `⚠ ${stuckOrders.length} commande${stuckOrders.length > 1 ? 's' : ''} bloquée${stuckOrders.length > 1 ? 's' : ''} > ${SLA_HOURS}h`,
            PREVIEW: `${stuckOrders.length} order${stuckOrders.length > 1 ? 's' : ''} stuck — vérifie le webhook Sinalite`,
            BODY_HTML: bodyHtml,
            SENDER_NAME: 'Plio SLA Monitor',
            SENDER_EMAIL: 'noreply@plio.ca',
          },
        });
        sent++;
      } catch (err) {
        log.warn({ err, to }, 'cron/order-sla-alerts: send fail (continuing other recipients)');
      }
    }

    // Round 39 #5 — Bump slaAlertedAt SEULEMENT si au moins 1 admin a reçu
    // l'email. Si tout fail, on garde slaAlertedAt à son ancienne valeur
    // → prochain cron retentera. Sinon, on dedup pour les 7j prochaines.
    let dedupBumped = 0;
    if (sent > 0) {
      const alertedAtNow = new Date();
      const ids = stuckOrders.map((o) => o.id);
      const bumpRes = await prisma.order.updateMany({
        where: { id: { in: ids } },
        data: { slaAlertedAt: alertedAtNow },
      });
      dedupBumped = bumpRes.count;
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      stuckCount: stuckOrders.length,
      recipients: recipients.length,
      sent,
      dedupBumped,
      cutoffHours: SLA_HOURS,
      realertAfterDays: REALERT_AFTER_DAYS,
    };
    log.info(result, 'cron/order-sla-alerts ran');
    await pingCronHealthcheck('order-sla-alerts', 'success', { stuck: stuckOrders.length, sent });
    await recordCronRun({
      name: 'order-sla-alerts',
      status: 'success',
      latencyMs: Date.now() - start,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/order-sla-alerts failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    await pingCronHealthcheck('order-sla-alerts', 'fail', { error: errMsg });
    await recordCronRun({
      name: 'order-sla-alerts',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
    });
    return NextResponse.json(
      { ok: false, error: errMsg, latencyMs: Date.now() - start },
      { status: 500 },
    );
  }
}
