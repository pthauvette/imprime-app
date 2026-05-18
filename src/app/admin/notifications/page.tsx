/**
 * /admin/notifications — Centralise tout ce qui a besoin d'attention admin.
 *
 * Vue agrégée sans nouvelle DB — on query les rows existantes par état
 * "needs attention" et on les présente dans un seul feed prioritisé.
 *
 * Catégories surveillées (toutes filtrent PENDING ou équivalent) :
 *   - DeleteAccountRequest PENDING (PIPEDA — 30j max)
 *   - SampleRequest PENDING (kit à expédier)
 *   - ResellerApplication PENDING (modérer)
 *   - CustomQuoteRequest PENDING (à quoter)
 *   - ContactMessage status=OPEN (à répondre)
 *   - WebhookEvent success=false dans 7j (à investiguer/replay)
 *   - EmailDelivery status=DEAD dans 7j (à investiguer)
 *
 * Priorités (color coding) :
 *   🔴 critical : DeleteAccountRequest (deadline légale), WebhookEvent fail
 *   🟡 warning  : ContactMessage open > 24h, EmailDelivery DEAD, ResellerApp > 48h
 *   🟢 info     : SampleRequest, CustomQuoteRequest fresh, ContactMessage < 24h
 */

import Link from 'next/link';
import type { Route } from 'next';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Notifications · Plio' };

type Priority = 'critical' | 'warning' | 'info';

interface Notif {
  id: string;
  category: string;
  priority: Priority;
  title: string;
  detail?: string;
  href: string;
  createdAt: Date;
  ageHours: number;
}

const PRIORITY_COLOR: Record<Priority, { bg: string; text: string; label: string }> = {
  critical: { bg: 'var(--danger-soft)', text: 'var(--danger)', label: 'Urgent' },
  warning: { bg: '#fef3c7', text: '#92400e', label: 'À traiter' },
  info: { bg: 'var(--bg-sunken)', text: 'var(--text-secondary)', label: 'Info' },
};

export default async function AdminNotificationsPage() {
  const session = await auth();
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 3600 * 1000);

  const [
    deleteRequests,
    sampleRequests,
    resellerApps,
    quotes,
    openMessages,
    failedWebhooks,
    deadEmails,
    ordersCount,
    usersCount,
  ] = await Promise.all([
    prisma.deleteAccountRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' }, // les plus vieilles en premier (PIPEDA deadline 30j)
      take: 20,
    }),
    prisma.sampleRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    prisma.resellerApplication.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    prisma.customQuoteRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    prisma.contactMessage.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    prisma.webhookEvent.findMany({
      where: { success: false, processedAt: { gte: sevenDaysAgo } },
      orderBy: { processedAt: 'desc' },
      take: 20,
    }),
    prisma.emailDelivery.findMany({
      where: { status: 'DEAD', updatedAt: { gte: sevenDaysAgo } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
    prisma.order.count(),
    prisma.user.count(),
  ]);

  const notifs: Notif[] = [];

  const ageHours = (d: Date) => Math.floor((now - d.getTime()) / 3_600_000);

  for (const d of deleteRequests) {
    const age = ageHours(d.createdAt);
    notifs.push({
      id: `delete:${d.id}`,
      category: 'Suppression compte',
      // Critique passé 7 jours (deadline PIPEDA 30j)
      priority: age > 24 * 7 ? 'critical' : 'warning',
      title: `Demande PIPEDA · ${d.emailSnapshot}`,
      detail: d.reason ? `« ${d.reason.slice(0, 100)}${d.reason.length > 100 ? '…' : ''} »` : 'Aucune raison fournie',
      href: `/admin/users/${d.userId}`,
      createdAt: d.createdAt,
      ageHours: age,
    });
  }

  for (const s of sampleRequests) {
    const age = ageHours(s.createdAt);
    notifs.push({
      id: `sample:${s.id}`,
      category: 'Kit échantillons',
      priority: age > 48 ? 'warning' : 'info',
      title: `${s.name} · ${s.shipCity}, ${s.shipProvince}`,
      detail: `${s.email} · ${(() => { try { return JSON.parse(s.selectedSamples).length; } catch { return '?'; } })()} échantillons`,
      href: `/admin/samples`,
      createdAt: s.createdAt,
      ageHours: age,
    });
  }

  for (const r of resellerApps) {
    const age = ageHours(r.createdAt);
    notifs.push({
      id: `reseller:${r.id}`,
      category: 'Application reseller',
      priority: age > 48 ? 'warning' : 'info',
      title: `${r.companyName} (${r.contactName})`,
      detail: `${r.email}${r.website ? ` · ${r.website}` : ''}`,
      href: `/admin/reseller-applications`,
      createdAt: r.createdAt,
      ageHours: age,
    });
  }

  for (const q of quotes) {
    const age = ageHours(q.createdAt);
    notifs.push({
      id: `quote:${q.id}`,
      category: 'Devis sur-mesure',
      priority: age > 48 ? 'warning' : 'info',
      title: q.projectType,
      detail: `${q.name}${q.companyName ? ` (${q.companyName})` : ''} · ${q.email}`,
      href: `/admin/quotes`,
      createdAt: q.createdAt,
      ageHours: age,
    });
  }

  for (const m of openMessages) {
    const age = ageHours(m.createdAt);
    notifs.push({
      id: `message:${m.id}`,
      category: 'Message client',
      priority: age > 24 ? 'warning' : 'info',
      title: m.subject,
      detail: `${m.name} <${m.email}>`,
      href: `/admin/messages`,
      createdAt: m.createdAt,
      ageHours: age,
    });
  }

  for (const w of failedWebhooks) {
    notifs.push({
      id: `webhook:${w.id}`,
      category: 'Webhook fail',
      priority: 'critical',
      title: `${w.source} · ${w.eventType}`,
      detail: w.error ?? `HTTP ${w.statusCode ?? '???'}`,
      href: `/admin/webhooks`,
      createdAt: w.processedAt,
      ageHours: ageHours(w.processedAt),
    });
  }

  for (const e of deadEmails) {
    notifs.push({
      id: `email:${e.id}`,
      category: 'Email DEAD',
      priority: 'warning',
      title: `${e.template} → ${e.to}`,
      detail: e.lastError ?? `${e.attempts} tentatives`,
      href: `/admin/emails`,
      createdAt: e.updatedAt,
      ageHours: ageHours(e.updatedAt),
    });
  }

  // Sort : critical first, then warning, then info, then by oldest first within priority
  const priorityOrder: Record<Priority, number> = { critical: 0, warning: 1, info: 2 };
  notifs.sort((a, b) => {
    const p = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (p !== 0) return p;
    return b.ageHours - a.ageHours;
  });

  const counts = {
    critical: notifs.filter((n) => n.priority === 'critical').length,
    warning: notifs.filter((n) => n.priority === 'warning').length,
    info: notifs.filter((n) => n.priority === 'info').length,
  };

  return (
    <div className="adm-shell">
      <AdminSidebar
        active={'notifications' as never}
        counts={{ orders: ordersCount, users: usersCount }}
        urgents={{ notifications: counts.critical + counts.warning > 0 } as never}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Notifications</h1>
            <p className="adm-page-subtitle">
              {notifs.length === 0
                ? 'Tout est sous contrôle. 👌'
                : (
                  <>
                    <strong style={{ color: 'var(--danger)' }}>{counts.critical} urgent{counts.critical > 1 ? 's' : ''}</strong>
                    {' · '}
                    <strong style={{ color: '#92400e' }}>{counts.warning} à traiter</strong>
                    {' · '}
                    {counts.info} info
                  </>
                )}
            </p>
          </div>
        </header>

        {notifs.length === 0 ? (
          <div className="adm-panel" style={{ padding: '80px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, margin: '0 0 8px' }}>
              Inbox zéro.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
              Aucune notification à traiter. Profite-en pour bosser sur la roadmap.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {notifs.map((n) => {
              const pc = PRIORITY_COLOR[n.priority];
              return (
                <Link
                  key={n.id}
                  href={n.href as Route}
                  className="adm-panel"
                  style={{
                    padding: '14px 18px',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 14,
                    alignItems: 'center',
                    textDecoration: 'none',
                    color: 'inherit',
                    borderLeft: `3px solid ${pc.text}`,
                  }}
                >
                  <span
                    style={{
                      padding: '3px 10px',
                      background: pc.bg,
                      color: pc.text,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      borderRadius: 'var(--r-pill)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pc.label}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginRight: 8 }}>
                        {n.category}
                      </span>
                      {n.title}
                    </div>
                    {n.detail && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {n.detail}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {ageString(n.ageHours)}
                    <div style={{ marginTop: 2, opacity: 0.7 }}>
                      {formatDateTime(n.createdAt.toISOString())}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function ageString(hours: number): string {
  if (hours < 1) return 'à l\'instant';
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  const weeks = Math.floor(days / 7);
  return `il y a ${weeks} sem.`;
}
