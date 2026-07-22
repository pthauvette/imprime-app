/**
 * /admin/quotes — gestion des demandes de devis sur-mesure.
 *
 * Liste par status (PENDING par défaut). Actions admin :
 * marquer quoté, accept, reject, archive, note.
 *
 * Email du contact en mailto pour répondre direct (Gmail / Apple Mail).
 */

import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminPagination from '@/components/admin/AdminPagination';
import { formatDateTime, formatCurrency } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import QuoteActions from './QuoteActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Devis sur-mesure' };

const STATUS_TABS = [
  { key: 'PENDING', label: 'À quoter', urgent: true },
  { key: 'QUOTED', label: 'Envoyés' },
  { key: 'ACCEPTED', label: 'Acceptés' },
  { key: 'REJECTED', label: 'Refusés' },
  { key: 'ARCHIVED', label: 'Archivés' },
];

const PER_PAGE = 25;

export default async function AdminQuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { session } = await requireAdminPage();
  const sp = await searchParams;
  const filter = STATUS_TABS.some((t) => t.key === sp.status) ? sp.status! : 'PENDING';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const [quotes, totalForFilter, counts, ordersCount, usersCount] = await Promise.all([
    prisma.customQuoteRequest.findMany({
      where: { status: filter },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.customQuoteRequest.count({ where: { status: filter } }),
    prisma.customQuoteRequest.groupBy({
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
        active="quotes"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Devis sur-mesure</h1>
            <p className="adm-page-subtitle">
              <strong style={{ color: pendingCount > 0 ? 'var(--warning, #D97706)' : undefined }}>
                {pendingCount} à quoter
              </strong>
              {' · '}
              {countByStatus('QUOTED')} envoyés · {countByStatus('ACCEPTED')} acceptés
            </p>
          </div>
        </header>

        <section style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12, flexWrap: 'wrap' }}>
          {STATUS_TABS.map((tab) => {
            const active = filter === tab.key;
            const count = countByStatus(tab.key);
            return (
              <a
                key={tab.key}
                href={`/admin/quotes?status=${tab.key}`}
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

        {quotes.length === 0 ? (
          <div className="adm-panel" style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Aucune demande pour ce filtre.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {quotes.map((q) => (
              <div key={q.id} className="adm-panel" style={{ padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{q.name}</strong>
                    {q.companyName && (
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 12 }}>
                        {q.companyName}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {formatDateTime(q.createdAt.toISOString())}
                  </div>
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <a
                    href={`mailto:${q.email}?subject=${encodeURIComponent('Re: Ta demande de devis sur Plio')}&body=${encodeURIComponent(`Salut ${q.name},\n\n`)}`}
                    style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}
                  >
                    <Icon name="mail" size={14} /> {q.email}
                  </a>
                  {q.phone && <span><Icon name="phone" size={14} /> {q.phone}</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12, padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)' }}>
                  <Detail label="Type de projet" value={q.projectType} />
                  {q.estimatedQuantity && <Detail label="Quantité" value={q.estimatedQuantity} />}
                  {q.deadline && <Detail label="Deadline" value={q.deadline} />}
                  {q.budgetCents !== null && (
                    <Detail label="Budget" value={formatCurrency(q.budgetCents / 100)} />
                  )}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
                    Description
                  </div>
                  <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {q.description}
                  </div>
                </div>

                {q.adminResponse && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
                      Quote envoyé {q.quotedAt && `· ${formatDateTime(q.quotedAt.toISOString())}`}
                    </div>
                    <div style={{ padding: 12, background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {q.adminResponse}
                    </div>
                  </div>
                )}

                {q.adminNotes && (
                  <div style={{ padding: 10, background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 'var(--r-sm)', fontSize: 12, marginBottom: 12 }}>
                    <strong>Note admin :</strong> {q.adminNotes}
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                  <QuoteActions id={q.id} status={q.status} />
                </div>
              </div>
            ))}
          </div>
        )}
        <AdminPagination
          page={page}
          total={totalForFilter}
          perPage={PER_PAGE}
          baseHref="/admin/quotes"
          extraParams={{ status: filter }}
        />
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
