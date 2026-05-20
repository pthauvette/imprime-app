/**
 * /admin/reseller-applications — gestion des demandes reseller.
 *
 * Liste par status (PENDING par défaut). Actions admin : approve,
 * reject (avec note), archive, ajouter note. Email du contact en lien
 * mailto pour répondre direct.
 */

import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatDateTime, formatCurrency } from '@/lib/format';
import ResellerActions from './ResellerActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Demandes reseller · Plio' };

const STATUS_TABS = [
  { key: 'PENDING', label: 'En attente', urgent: true },
  { key: 'APPROVED', label: 'Acceptées' },
  { key: 'REJECTED', label: 'Refusées' },
  { key: 'ARCHIVED', label: 'Archivées' },
];

export default async function AdminResellerApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { session } = await requireAdminPage();
  const { status: statusParam } = await searchParams;
  const filter = STATUS_TABS.some((t) => t.key === statusParam) ? statusParam! : 'PENDING';

  const [apps, counts, ordersCount, usersCount] = await Promise.all([
    prisma.resellerApplication.findMany({
      where: { status: filter },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.resellerApplication.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.order.count(),
    prisma.user.count(),
  ]);

  const countByStatus = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const pendingCount = countByStatus('PENDING');

  return (
    <div className="adm-shell">
      <AdminSidebar
        active={'reseller-applications' as never}
        counts={{ orders: ordersCount, users: usersCount }}
        urgents={{ 'reseller-applications': pendingCount > 0 } as never}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Demandes reseller</h1>
            <p className="adm-page-subtitle">
              <strong style={{ color: pendingCount > 0 ? 'var(--warning, #D97706)' : undefined }}>
                {pendingCount} en attente
              </strong>
              {' · '}
              {countByStatus('APPROVED')} acceptées · {countByStatus('REJECTED')} refusées
            </p>
          </div>
        </header>

        {/* Tabs filtres */}
        <section style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          {STATUS_TABS.map((tab) => {
            const active = filter === tab.key;
            const count = countByStatus(tab.key);
            return (
              <a
                key={tab.key}
                href={`/admin/reseller-applications?status=${tab.key}`}
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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: tab.urgent && count > 0 ? 'var(--warning, #D97706)' : 'inherit' }}>
                  {count}
                </span>
              </a>
            );
          })}
        </section>

        {apps.length === 0 ? (
          <div className="adm-panel" style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Aucune application pour ce filtre.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {apps.map((a) => (
              <div key={a.id} className="adm-panel" style={{ padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{a.companyName}</strong>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 12 }}>
                      {a.contactName}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {formatDateTime(a.createdAt.toISOString())}
                  </div>
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <a href={`mailto:${a.email}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                    📧 {a.email}
                  </a>
                  {a.phone && <span>📞 {a.phone}</span>}
                  {a.website && (
                    <a href={a.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                      🌐 {a.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12, padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)' }}>
                  {a.estimatedMonthlyCents !== null && (
                    <Detail label="Volume estimé" value={`${formatCurrency(a.estimatedMonthlyCents / 100)} / mois`} />
                  )}
                  {a.currentSolution && (
                    <Detail label="Solution actuelle" value={a.currentSolution} />
                  )}
                  {a.projectTypes && (
                    <Detail label="Types de projets" value={a.projectTypes} />
                  )}
                </div>

                {a.message && (
                  <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', fontSize: 13, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 12 }}>
                    « {a.message} »
                  </div>
                )}

                {a.adminNotes && (
                  <div style={{ padding: 10, background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 'var(--r-sm)', fontSize: 12, marginBottom: 12 }}>
                    <strong>Note admin :</strong> {a.adminNotes}
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                  <ResellerActions id={a.id} status={a.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}
