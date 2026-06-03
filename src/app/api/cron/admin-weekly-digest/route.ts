/**
 * GET /api/cron/admin-weekly-digest
 *
 * Round 29 #4. Companion to admin-daily-summary mais sur fenêtre 7j +
 * deeper insights : top 3 customers, week-over-week comparaison,
 * pending action pile-up.
 *
 * Schedule : mercredi 9h UTC = milieu de semaine, donne signal avant
 * weekend ramp-down. Lundi serait noyé dans le retour weekend.
 *
 * Reuse template admin-custom-message (Round 12 #5 broadcast pattern) :
 * on pre-build le digest HTML côté server, passe en BODY_HTML.
 * Évite d'ajouter un nouveau template HTML qui aurait son enum, ses
 * EMAIL_SUBJECTS, ses sample-vars, etc.
 *
 * Auth : Bearer CRON_SECRET.
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

/**
 * Format dollars CAD comme "1 234,56 $" (fr-CA).
 */
function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${Math.round(n * 100)} %`;
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'admin-weekly-digest');
  if (denied) return denied;

  const adminEmailsRaw = process.env.ADMIN_EMAILS ?? '';
  const adminEmails = adminEmailsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));

  if (adminEmails.length === 0) {
    log.warn('cron/admin-weekly-digest: ADMIN_EMAILS not set, skipping');
    return NextResponse.json({ ok: true, skipped: 'admin_emails_not_configured' });
  }

  const startTs = Date.now();
  const now = new Date();
  const week1Start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const week2Start = new Date(now.getTime() - 14 * 24 * 3600 * 1000);

  try {
    // Parallel queries pour les KPIs week-over-week
    const [
      revenueThisWeek,
      revenueLastWeek,
      ordersThisWeek,
      ordersLastWeek,
      failuresThisWeek,
      pendingAction,
      topCustomersThisWeek,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: { paidAt: { gte: week1Start }, status: { notIn: ['CANCELLED', 'FAILED'] } },
        _sum: { amountCents: true },
      }),
      prisma.order.aggregate({
        where: { paidAt: { gte: week2Start, lt: week1Start }, status: { notIn: ['CANCELLED', 'FAILED'] } },
        _sum: { amountCents: true },
      }),
      prisma.order.count({
        where: { paidAt: { gte: week1Start }, status: { notIn: ['CANCELLED', 'FAILED'] } },
      }),
      prisma.order.count({
        where: { paidAt: { gte: week2Start, lt: week1Start }, status: { notIn: ['CANCELLED', 'FAILED'] } },
      }),
      prisma.order.count({
        where: { paidAt: { gte: week1Start }, status: 'FAILED' },
      }),
      prisma.order.count({
        where: { status: { in: ['PENDING', 'PAID', 'FAILED'] } },
      }),
      prisma.order.groupBy({
        by: ['userId'],
        where: { paidAt: { gte: week1Start }, status: { notIn: ['CANCELLED', 'FAILED'] } },
        _sum: { amountCents: true },
        orderBy: { _sum: { amountCents: 'desc' } },
        take: 3,
      }),
    ]);

    // Hydrate top customers avec User.email pour affichage lisible
    const topCustomerUsers = topCustomersThisWeek.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: topCustomersThisWeek.map((t) => t.userId) } },
          select: { id: true, email: true, firstName: true, name: true },
        })
      : [];
    const userById = new Map(topCustomerUsers.map((u) => [u.id, u]));

    const revThis = revenueThisWeek._sum.amountCents ?? 0;
    const revLast = revenueLastWeek._sum.amountCents ?? 0;
    const revDelta = revLast > 0 ? (revThis - revLast) / revLast : null;
    const orderDelta = ordersLastWeek > 0 ? (ordersThisWeek - ordersLastWeek) / ordersLastWeek : null;

    // Pre-build le BODY_HTML (escape pas critique : pas d'input user)
    const weekLabel = `${week1Start.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })} → ${now.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}`;

    const topCustomersHtml = topCustomersThisWeek.length === 0
      ? '<p style="margin:8px 0;color:#7A8780;font-style:italic;">Aucun customer cette semaine.</p>'
      : `<ol style="margin:8px 0;padding-left:20px;">${topCustomersThisWeek.map((t) => {
          const u = userById.get(t.userId);
          const name = u?.firstName ?? u?.name ?? u?.email ?? 'Customer ?';
          return `<li><strong>${name}</strong> — ${fmtCents(t._sum.amountCents ?? 0)}</li>`;
        }).join('')}</ol>`;

    const bodyHtml = `
      <p>Récap du <strong>${weekLabel}</strong>.</p>

      <h3 style="margin-top:20px;color:#1F3D2B;">📊 Chiffres clés</h3>
      <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:#4A554D;">Revenu 7j</td>
          <td align="right" style="padding:6px 0;font-weight:600;">${fmtCents(revThis)}${revDelta !== null ? ` <span style="color:${revDelta >= 0 ? '#16a34a' : '#B83A2C'};font-size:12px;">(${fmtPct(revDelta)} vs sem. dernière)</span>` : ''}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#4A554D;">Commandes 7j</td>
          <td align="right" style="padding:6px 0;font-weight:600;">${ordersThisWeek}${orderDelta !== null ? ` <span style="color:${orderDelta >= 0 ? '#16a34a' : '#B83A2C'};font-size:12px;">(${fmtPct(orderDelta)})</span>` : ''}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#4A554D;">Échecs 7j</td>
          <td align="right" style="padding:6px 0;font-weight:600;color:${failuresThisWeek > 0 ? '#B83A2C' : '#16a34a'};">${failuresThisWeek}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#4A554D;">En attente d'action <small>(PENDING/PAID/FAILED)</small></td>
          <td align="right" style="padding:6px 0;font-weight:600;color:${pendingAction > 5 ? '#D97706' : '#1F3D2B'};">${pendingAction}</td>
        </tr>
      </table>

      <h3 style="margin-top:24px;color:#1F3D2B;">🏆 Top 3 customers</h3>
      ${topCustomersHtml}

      <p style="margin-top:24px;font-size:13px;color:#4A554D;">
        Détail temps réel sur le <a href="${APP_URL}/admin" style="color:#1F3D2B;">dashboard admin</a>.
      </p>
    `.trim();

    // Send to all admin emails. Parallèle sans concurrency limit
    // (typiquement ≤ 5 admins).
    let sent = 0;
    for (const to of adminEmails) {
      try {
        const result = await sendAdminCustomMessageEmail({
          to,
          replyTo: to, // self-reply, pas de bounceback noise
          vars: {
            ORDER_ID: '',
            ORDER_URL: `${APP_URL}/admin`,
            SUBJECT: `📊 Récap hebdo Plio · ${weekLabel}`,
            PREVIEW: `Revenu ${fmtCents(revThis)} · ${ordersThisWeek} commandes`,
            BODY_HTML: bodyHtml,
            SENDER_NAME: 'Plio Weekly Digest',
            SENDER_EMAIL: 'noreply@plio.ca',
          },
        });
        if (result.sent) sent++;
      } catch (err) {
        log.warn({ err, to }, 'admin-weekly-digest: send failed for one recipient');
      }
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - startTs,
      weekLabel,
      recipients: adminEmails.length,
      sent,
      revenueThisWeek: revThis,
      revenueLastWeek: revLast,
      ordersThisWeek,
      ordersLastWeek,
      failuresThisWeek,
      pendingAction,
      topCustomers: topCustomersThisWeek.length,
    };
    log.info(result, 'cron/admin-weekly-digest ran');
    void pingCronHealthcheck('admin-weekly-digest', 'success', { sent, recipients: adminEmails.length });
    void recordCronRun({
      name: 'admin-weekly-digest',
      status: 'success',
      latencyMs: Date.now() - startTs,
      data: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/admin-weekly-digest failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('admin-weekly-digest', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'admin-weekly-digest',
      status: 'fail',
      latencyMs: Date.now() - startTs,
      errorMessage: errMsg,
    });
    return NextResponse.json(
      { ok: false, error: errMsg, latencyMs: Date.now() - startTs },
      { status: 500 },
    );
  }
}
