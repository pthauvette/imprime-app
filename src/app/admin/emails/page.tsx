/**
 * /admin/emails — Visualisation + control de la queue EmailDelivery.
 *
 * Filtres par status (PENDING / SENT / FAILED / DEAD), bouton retry
 * manuel sur les FAILED/DEAD, détail de l'erreur pour debug.
 */

import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatDateTime } from '@/lib/format';
import EmailsBulkTable, { type EmailListItem } from './EmailsBulkTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Queue email' };

type StatusFilter = 'all' | 'PENDING' | 'SENT' | 'FAILED' | 'DEAD';

const STATUS_BADGES: Record<string, { bg: string; color: string }> = {
  PENDING: { bg: 'var(--bg-sunken)', color: 'var(--text-muted)' },
  SENT: { bg: 'var(--success-soft, #f0fdf4)', color: 'var(--success, #16a34a)' },
  FAILED: { bg: 'var(--warning-soft, #FFF6E5)', color: 'var(--warning, #D97706)' },
  DEAD: { bg: 'var(--danger-soft)', color: 'var(--danger)' },
};

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { session } = await requireAdminPage();
  const { status: statusParam } = await searchParams;
  const filter: StatusFilter = (
    ['PENDING', 'SENT', 'FAILED', 'DEAD'].includes(statusParam ?? '') ? statusParam : 'all'
  ) as StatusFilter;

  // Round 21 #5 — stats analytics par template (sent count + open rate)
  // sur 30 derniers jours. Pour MVP : query simple, on agrège côté JS.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [emails, counts, orders, users, templateStats] = await Promise.all([
    prisma.emailDelivery.findMany({
      where: filter === 'all' ? {} : { status: filter },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.emailDelivery.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.order.count(),
    prisma.user.count(),
    // Per-template aggregate sur 30j : count sent + count opened
    prisma.emailDelivery.groupBy({
      by: ['template', 'status'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
    }).catch(() => []),
  ]);

  // Build template stats map : { template → { sent, dead, opened, openRate } }
  // Open rate computed séparément via openedAt count.
  const openedByTemplate = await prisma.emailDelivery.groupBy({
    by: ['template'],
    where: {
      createdAt: { gte: thirtyDaysAgo },
      openedAt: { not: null },
    },
    _count: { _all: true },
  }).catch(() => []);
  const openedMap = new Map(openedByTemplate.map((g) => [g.template, g._count._all]));

  // Round 27 #1 — funnel abandoned-cart (sent → clicked → recovered) sur 30j.
  // .catch fallback : si les colonnes ne sont pas migrées encore, on render
  // le widget en off plutôt que crasher la page.
  const cartFunnel = await Promise.all([
    prisma.abandonedCart.count({ where: { emailSentAt: { gte: thirtyDaysAgo } } }),
    prisma.abandonedCart.count({ where: { recoveryClickedAt: { gte: thirtyDaysAgo } } }),
    prisma.order.count({
      where: {
        recoveredFromCartId: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
  ]).then(([sent, clicked, recovered]) => ({ sent, clicked, recovered }))
    .catch(() => ({ sent: 0, clicked: 0, recovered: 0 }));

  interface TplStat { template: string; sent: number; dead: number; opened: number; openRate: number }
  const tplStatsMap = new Map<string, TplStat>();
  for (const s of templateStats) {
    const existing = tplStatsMap.get(s.template) ?? { template: s.template, sent: 0, dead: 0, opened: 0, openRate: 0 };
    if (s.status === 'SENT') existing.sent += s._count._all;
    if (s.status === 'DEAD') existing.dead += s._count._all;
    tplStatsMap.set(s.template, existing);
  }
  for (const [tpl, opened] of openedMap.entries()) {
    const existing = tplStatsMap.get(tpl);
    if (existing) {
      existing.opened = opened;
      existing.openRate = existing.sent > 0 ? (opened / existing.sent) * 100 : 0;
    }
  }
  const tplStatsList = Array.from(tplStatsMap.values()).sort((a, b) => b.sent - a.sent);

  const countByStatus = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const total = counts.reduce((a, c) => a + c._count._all, 0);

  const tabs: Array<{ key: StatusFilter; label: string; count: number; urgent?: boolean }> = [
    { key: 'all', label: 'Tous', count: total },
    { key: 'PENDING', label: 'En attente', count: countByStatus('PENDING') },
    { key: 'SENT', label: 'Envoyés', count: countByStatus('SENT') },
    { key: 'FAILED', label: 'Échec (retry)', count: countByStatus('FAILED'), urgent: countByStatus('FAILED') > 0 },
    { key: 'DEAD', label: 'DEAD', count: countByStatus('DEAD'), urgent: countByStatus('DEAD') > 0 },
  ];

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="emails"
        counts={{ orders, users, emails: countByStatus('FAILED') + countByStatus('DEAD') }}
        urgents={{ emails: countByStatus('DEAD') > 0 }}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Queue email</h1>
            <p className="adm-page-subtitle">
              {total} email{total > 1 ? 's' : ''} total · {countByStatus('FAILED')} en retry · {countByStatus('DEAD')} DEAD
            </p>
          </div>
        </header>

        {/* Round 27 #1 — Funnel recovery abandoned-cart (30j) */}
        {cartFunnel.sent > 0 && (
          <section
            style={{
              marginBottom: 24,
              padding: 20,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-xl)',
            }}
          >
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, margin: '0 0 14px', letterSpacing: '-0.01em' }}>
              🛒 Funnel recovery cart abandonné · 30 derniers jours
            </h2>
            <div style={{ display: 'flex', gap: 24, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <FunnelStep label="Email envoyé" value={cartFunnel.sent} />
              <FunnelArrow />
              <FunnelStep
                label="Cliqué"
                value={cartFunnel.clicked}
                rate={cartFunnel.sent > 0 ? (cartFunnel.clicked / cartFunnel.sent) * 100 : null}
              />
              <FunnelArrow />
              <FunnelStep
                label="Order placée"
                value={cartFunnel.recovered}
                rate={cartFunnel.sent > 0 ? (cartFunnel.recovered / cartFunnel.sent) * 100 : null}
                positive
              />
            </div>
            <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              Click tracker /api/recovery/click set <code>AbandonedCart.recoveryClickedAt</code>. Recovered = orders avec <code>recoveredFromCartId</code> non-null (linked dans les 30j post-click).
            </p>
          </section>
        )}

        {/* Round 21 #5 — Analytics par template (30j) */}
        {tplStatsList.length > 0 && (
          <section style={{
            marginBottom: 24,
            padding: 20,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
          }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, margin: '0 0 14px', letterSpacing: '-0.01em' }}>
              📊 Analytics par template · 30 derniers jours
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px 4px', fontWeight: 600 }}>Template</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Sent</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Opened</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Open rate</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>DEAD</th>
                </tr>
              </thead>
              <tbody>
                {tplStatsList.map((s) => {
                  const rateColor = s.openRate >= 30 ? 'var(--success, #16a34a)' : s.openRate >= 15 ? 'var(--accent-primary)' : 'var(--text-muted)';
                  return (
                    <tr key={s.template} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 4px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>
                        {s.template}
                      </td>
                      <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {s.sent}
                      </td>
                      <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {s.opened}
                      </td>
                      <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: rateColor }}>
                        {s.sent > 0 ? `${s.openRate.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: s.dead > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {s.dead}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              Open rate = (rows avec openedAt set) / (rows SENT). Tracking via pixel 1×1 dans email body (peut être bloqué par certains clients mail).
            </p>
          </section>
        )}

        {/* Tabs filtres */}
        <section style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          {tabs.map((tab) => {
            const href = tab.key === 'all' ? '/admin/emails' : `/admin/emails?status=${tab.key}`;
            const active = filter === tab.key;
            return (
              <a
                key={tab.key}
                href={href}
                style={{
                  padding: '8px 14px',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: active ? 'var(--accent-primary)' : 'var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {tab.label}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: tab.urgent ? 'var(--danger)' : 'inherit' }}>
                  {tab.count}
                </span>
              </a>
            );
          })}
        </section>

        {/* Table avec bulk selection */}
        <section className="adm-panel">
          <EmailsBulkTable
            emails={emails.map((e): EmailListItem => ({
              id: e.id,
              status: e.status,
              to: e.to,
              template: e.template,
              label: e.label,
              attempts: e.attempts,
              maxAttempts: e.maxAttempts,
              createdAt: e.createdAt.toISOString(),
              sentAt: e.sentAt ? e.sentAt.toISOString() : null,
            }))}
          />

          {/* Détail erreurs (collapsible per row dans la table serait mieux,
              mais pour MVP on liste les erreurs sous la table) */}
          {emails.some((e) => e.lastError) && (
            <div style={{ padding: 22, borderTop: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>
                Erreurs récentes
              </h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {emails.filter((e) => e.lastError).slice(0, 5).map((e) => (
                  <details key={e.id} style={{ fontSize: 12 }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <strong>{e.template}</strong> → {e.to} ({e.attempts} tentatives)
                    </summary>
                    <pre style={{ marginTop: 6, padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', fontSize: 10, fontFamily: 'var(--font-mono)', overflow: 'auto' }}>{e.lastError}</pre>
                  </details>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'top',
};

// Round 27 #1 — funnel components
function FunnelStep({ label, value, rate, positive }: { label: string; value: number; rate?: number | null; positive?: boolean }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em', color: positive ? 'var(--success, #16a34a)' : 'var(--text-primary)' }}>
        {value}
      </div>
      {rate !== undefined && rate !== null && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {rate.toFixed(1)} % du sent
        </div>
      )}
    </div>
  );
}

function FunnelArrow() {
  return (
    <div style={{ fontSize: 22, color: 'var(--text-muted)', alignSelf: 'center' }} aria-hidden>
      →
    </div>
  );
}
