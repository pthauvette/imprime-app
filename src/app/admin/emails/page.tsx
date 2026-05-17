/**
 * /admin/emails — Visualisation + control de la queue EmailDelivery.
 *
 * Filtres par status (PENDING / SENT / FAILED / DEAD), bouton retry
 * manuel sur les FAILED/DEAD, détail de l'erreur pour debug.
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatDateTime } from '@/lib/format';
import EmailRetryButton from './EmailRetryButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Queue email · Plio' };

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
  const session = await auth();
  const { status: statusParam } = await searchParams;
  const filter: StatusFilter = (
    ['PENDING', 'SENT', 'FAILED', 'DEAD'].includes(statusParam ?? '') ? statusParam : 'all'
  ) as StatusFilter;

  const [emails, counts, orders, users] = await Promise.all([
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
  ]);

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

        {/* Table */}
        <section className="adm-panel">
          {emails.length === 0 ? (
            <div style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Aucun email pour ce filtre.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={th}>Status</th>
                  <th style={th}>Destinataire</th>
                  <th style={th}>Template</th>
                  <th style={th}>Label</th>
                  <th style={{ ...th, textAlign: 'right' }}>Tentatives</th>
                  <th style={th}>Créé</th>
                  <th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((e) => {
                  const badge = STATUS_BADGES[e.status] ?? STATUS_BADGES.PENDING;
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={td}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          background: badge.bg,
                          color: badge.color,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          fontFamily: 'var(--font-mono)',
                          borderRadius: 4,
                        }}>
                          {e.status}
                        </span>
                        {e.sentAt && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                            envoyé {formatDateTime(e.sentAt.toISOString())}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.to}</td>
                      <td style={td}>
                        <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{e.template}</code>
                      </td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{e.label ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {e.attempts} / {e.maxAttempts}
                      </td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{formatDateTime(e.createdAt.toISOString())}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {(e.status === 'FAILED' || e.status === 'DEAD') && (
                          <EmailRetryButton id={e.id} status={e.status} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

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
