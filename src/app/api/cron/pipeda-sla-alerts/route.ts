/**
 * GET /api/cron/pipeda-sla-alerts
 *
 * Round 39 #3. PIPEDA exige que toute demande de suppression soit
 * traitée dans un délai raisonnable — 30 jours est le standard (et
 * l'engagement Plio communiqué dans le legal/privacy).
 *
 * Sans ce cron, l'admin peut oublier qu'une demande est en attente.
 * Un seul "PIPEDA delete request ignoré 31 jours" suffit pour qu'une
 * plainte CAI Québec aboutisse à une amende.
 *
 * Logique :
 *   - Scan DeleteAccountRequest status=PENDING
 *   - 25-29 jours depuis createdAt → WARN admin (email + Slack warning)
 *   - ≥ 30 jours → CRITICAL admin (Slack critical + email tous les admins)
 *
 * Schedule : quotidien 13h UTC (= 8h ET hiver / 9h ET été), aligné avec
 * les autres crons human-facing post-Round 38 #5.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { sendCriticalAlert } from '@/lib/alerting/slack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WARN_DAYS = 25;
const CRITICAL_DAYS = 30;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'pipeda-sla-alerts');
  if (denied) return denied;

  const start = Date.now();
  const adminEmailsRaw = process.env.ADMIN_EMAILS;
  if (!adminEmailsRaw) {
    const result = { ok: true, latencyMs: Date.now() - start, skipped: 'admin_emails_not_configured' };
    log.warn('cron/pipeda-sla-alerts: ADMIN_EMAILS not configured — skip');
    void recordCronRun({ name: 'pipeda-sla-alerts', status: 'success', latencyMs: Date.now() - start, data: result });
    return NextResponse.json(result);
  }
  const recipients = adminEmailsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  const now = new Date();
  const warnCutoff = new Date(now.getTime() - WARN_DAYS * 24 * 3600 * 1000);
  const criticalCutoff = new Date(now.getTime() - CRITICAL_DAYS * 24 * 3600 * 1000);

  try {
    const pending = await prisma.deleteAccountRequest.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: warnCutoff },
      },
      select: {
        id: true,
        userId: true,
        emailSnapshot: true,
        reason: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const critical = pending.filter((r) => r.createdAt < criticalCutoff);
    const warning = pending.filter((r) => r.createdAt >= criticalCutoff);

    if (pending.length === 0) {
      const result = { ok: true, latencyMs: Date.now() - start, warned: 0, critical: 0 };
      log.info(result, 'cron/pipeda-sla-alerts ran (zero stuck)');
      void pingCronHealthcheck('pipeda-sla-alerts', 'success', result);
      void recordCronRun({ name: 'pipeda-sla-alerts', status: 'success', latencyMs: Date.now() - start, data: result });
      return NextResponse.json(result);
    }

    // Build email body HTML avec liste des requests stuck
    const buildRow = (r: typeof pending[0]) => {
      const ageDays = Math.floor((now.getTime() - r.createdAt.getTime()) / (24 * 3600 * 1000));
      const isCritical = r.createdAt < criticalCutoff;
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee"><a href="https://plio.ca/admin/users/${r.userId}">${r.userId.slice(-6).toUpperCase()}</a></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${r.emailSnapshot}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${isCritical ? '#dc2626' : '#D97706'};font-weight:600">${ageDays}j ${isCritical ? '⚠ CRITIQUE' : ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#666">${r.reason ?? '(pas de raison)'}</td>
      </tr>`;
    };

    const bodyHtml = `
      <p><strong>PIPEDA exige réponse dans 30 jours max.</strong> Voici les demandes de suppression en attente depuis &ge; ${WARN_DAYS}j :</p>
      ${critical.length > 0 ? `
        <p style="color:#dc2626;font-weight:600">⚠ ${critical.length} demande${critical.length > 1 ? 's' : ''} DÉPASSE${critical.length > 1 ? 'NT' : ''} 30 jours — risque CAI Québec</p>
      ` : ''}
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:12px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px 10px;text-align:left">User</th>
            <th style="padding:8px 10px;text-align:left">Email</th>
            <th style="padding:8px 10px;text-align:left">Age</th>
            <th style="padding:8px 10px;text-align:left">Raison</th>
          </tr>
        </thead>
        <tbody>${pending.map(buildRow).join('\n')}</tbody>
      </table>
      <p style="margin-top:16px;font-size:12px;color:#666">
        Action : ouvrir <a href="https://plio.ca/admin/users">/admin/users</a> → click sur l'user → bouton "Supprimer compte (PIPEDA)".
      </p>
    `;

    // Slack alert si critical présents (escalation pour les ≥ 30j)
    if (critical.length > 0) {
      void sendCriticalAlert({
        severity: 'critical',
        title: `⚠ ${critical.length} demande${critical.length > 1 ? 's' : ''} PIPEDA délai dépassé (30j+)`,
        body: `Risque CAI Québec. ${critical.length} request${critical.length > 1 ? 's' : ''} à traiter immédiatement.`,
        context: {
          criticalIds: critical.map((r) => r.id),
          warningCount: warning.length,
        },
      });
    }

    // Email aux admins (allSettled pattern, Round 37 #4)
    const sendsRaw = await Promise.allSettled(
      recipients.map(async (to) => {
        const r = await sendAdminCustomMessageEmail({
          to,
          replyTo: to,
          vars: {
            ORDER_ID: '',
            ORDER_URL: 'https://plio.ca/admin/users',
            SUBJECT: `${critical.length > 0 ? '⚠ CRITIQUE' : 'Heads up'} : ${pending.length} demande${pending.length > 1 ? 's' : ''} PIPEDA en attente`,
            PREVIEW: `${critical.length} critique${critical.length > 1 ? 's' : ''} ≥30j + ${warning.length} warning ≥25j`,
            BODY_HTML: bodyHtml,
            SENDER_NAME: 'Plio PIPEDA Monitor',
            SENDER_EMAIL: 'noreply@plio.ca',
          },
        });
        return { to, sent: r.sent };
      }),
    );
    const sent = sendsRaw.filter((s) => s.status === 'fulfilled' && s.value.sent).length;

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      pending: pending.length,
      warned: warning.length,
      critical: critical.length,
      recipients: recipients.length,
      sent,
    };
    log.info(result, 'cron/pipeda-sla-alerts ran');
    void pingCronHealthcheck('pipeda-sla-alerts', 'success', { pending: pending.length, critical: critical.length });
    void recordCronRun({
      name: 'pipeda-sla-alerts',
      status: 'success',
      latencyMs: Date.now() - start,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/pipeda-sla-alerts failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('pipeda-sla-alerts', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'pipeda-sla-alerts',
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
