/**
 * /admin/newsletter — Liste subscribers + export CSV.
 *
 * MVP minimal : juste browse + export. Pas d'éditeur de campagne (à
 * faire via Mailchimp/Resend une fois Patrick a une centaine de leads).
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Newsletter · Plio' };

export default async function AdminNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  const { status: statusParam } = await searchParams;
  const filter = ['ACTIVE', 'UNSUBSCRIBED', 'BOUNCED'].includes(statusParam ?? '') ? statusParam! : 'ACTIVE';

  const [subscribers, counts, orders, users] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where: { status: filter },
      orderBy: { subscribedAt: 'desc' },
      take: 200,
    }),
    prisma.newsletterSubscriber.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.count(),
    prisma.user.count(),
  ]);

  const countByStatus = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const activeCount = countByStatus('ACTIVE');

  // Source breakdown for ACTIVE subscribers
  const sourceBreakdown = activeCount > 0 ? await prisma.newsletterSubscriber.groupBy({
    by: ['source'],
    where: { status: 'ACTIVE' },
    _count: { _all: true },
    orderBy: { _count: { source: 'desc' } },
    take: 5,
  }) : [];

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="settings"
        counts={{ orders, users }}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Newsletter</h1>
            <p className="adm-page-subtitle">
              {activeCount} abonné{activeCount > 1 ? 's' : ''} actif{activeCount > 1 ? 's' : ''}{' '}
              {countByStatus('UNSUBSCRIBED') > 0 && (
                <>· {countByStatus('UNSUBSCRIBED')} désabonné{countByStatus('UNSUBSCRIBED') > 1 ? 's' : ''}</>
              )}
            </p>
          </div>
          <div className="adm-topbar-actions">
            <a
              href="/api/admin/newsletter/export"
              download
              className="btn btn-secondary btn-sm"
            >
              ⬇ Export CSV
            </a>
          </div>
        </header>

        {/* Source breakdown stats */}
        {sourceBreakdown.length > 0 && (
          <section className="adm-panel" style={{ marginBottom: 16 }}>
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">Provenance des inscriptions</h2>
            </div>
            <div style={{ padding: 22, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {sourceBreakdown.map((s) => (
                <div key={s.source ?? 'unknown'}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {s.source ?? '(unknown)'}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>
                    {s._count._all}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tabs */}
        <section style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          {[
            { key: 'ACTIVE', label: 'Actifs', count: countByStatus('ACTIVE') },
            { key: 'UNSUBSCRIBED', label: 'Désabonnés', count: countByStatus('UNSUBSCRIBED') },
            { key: 'BOUNCED', label: 'Bounced', count: countByStatus('BOUNCED') },
          ].map((tab) => {
            const active = filter === tab.key;
            return (
              <a
                key={tab.key}
                href={`/admin/newsletter?status=${tab.key}`}
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
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                {tab.label}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{tab.count}</span>
              </a>
            );
          })}
        </section>

        {/* List */}
        <section className="adm-panel">
          {subscribers.length === 0 ? (
            <div style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Aucun abonné pour ce filtre.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={th}>Email</th>
                  <th style={th}>Source</th>
                  <th style={th}>Inscrit le</th>
                  <th style={th}>IP consent</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{s.email}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{s.source ?? '—'}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{formatDateTime(s.subscribedAt.toISOString())}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{s.consentIp ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong>Workflow recommandé :</strong> Export CSV → import dans Mailchimp / Resend / ConvertKit pour envoyer tes campagnes. Plio ne fait que la capture des leads (CASL-compliant avec consent IP) — l&apos;envoi de campagnes est délégué à une plateforme dédiée.
        </p>
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
};
