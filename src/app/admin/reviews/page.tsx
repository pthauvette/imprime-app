/**
 * /admin/reviews — Moderation reviews customer.
 *
 * Liste les reviews PENDING en premier (urgents), puis APPROVED puis
 * REJECTED. Actions inline : approve, reject (avec raison), toggle
 * featured (top-3 sur landing).
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatDateTime } from '@/lib/format';
import ReviewActions from './ReviewActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Reviews · Plio' };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  const { status: statusParam } = await searchParams;
  const filter = ['PENDING', 'APPROVED', 'REJECTED'].includes(statusParam ?? '') ? statusParam! : 'PENDING';

  const [reviews, counts, orders, users] = await Promise.all([
    prisma.review.findMany({
      where: { status: filter },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        order: {
          select: { sinaliteOrderId: true, productSummary: true, amountCents: true, user: { select: { email: true } } },
        },
      },
    }),
    prisma.review.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.count(),
    prisma.user.count(),
  ]);

  const countByStatus = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const avgRating = await prisma.review.aggregate({
    where: { status: 'APPROVED' },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="reviews"
        counts={{ orders, users, reviews: countByStatus('PENDING') }}
        urgents={{ reviews: countByStatus('PENDING') > 0 }}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Reviews</h1>
            <p className="adm-page-subtitle">
              {avgRating._count._all} avis publiés · note moyenne {avgRating._avg.rating?.toFixed(1) ?? '—'} / 5 ·{' '}
              <strong style={{ color: 'var(--warning, #D97706)' }}>{countByStatus('PENDING')} en attente</strong>
            </p>
          </div>
        </header>

        {/* Tabs filtres */}
        <section style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          {[
            { key: 'PENDING', label: 'En attente', count: countByStatus('PENDING'), urgent: true },
            { key: 'APPROVED', label: 'Publiées', count: countByStatus('APPROVED') },
            { key: 'REJECTED', label: 'Rejetées', count: countByStatus('REJECTED') },
          ].map((tab) => {
            const active = filter === tab.key;
            return (
              <a
                key={tab.key}
                href={`/admin/reviews?status=${tab.key}`}
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
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: tab.urgent && tab.count > 0 ? 'var(--warning, #D97706)' : 'inherit' }}>
                  {tab.count}
                </span>
              </a>
            );
          })}
        </section>

        {/* List */}
        {reviews.length === 0 ? (
          <div className="adm-panel" style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Aucune review pour ce filtre.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {reviews.map((r) => (
              <div key={r.id} className="adm-panel" style={{ padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ fontSize: 24 }}>
                      {'★'.repeat(r.rating)}<span style={{ color: 'var(--border-default)' }}>{'★'.repeat(5 - r.rating)}</span>
                    </span>
                    <strong style={{ fontSize: 15 }}>{r.displayName}</strong>
                    {r.isFeatured && (
                      <span style={{ padding: '2px 8px', background: 'var(--accent-soft)', color: 'var(--accent-primary)', fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, borderRadius: 4 }}>
                        ★ Featured
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {formatDateTime(r.createdAt.toISOString())}
                  </div>
                </div>

                {r.comment && (
                  <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)', fontStyle: 'italic' }}>
                    « {r.comment} »
                  </p>
                )}

                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Order #{r.order.sinaliteOrderId ?? r.orderId.slice(-6).toUpperCase()} · {r.order.productSummary ?? '—'} · {(r.order.amountCents / 100).toFixed(2)} $ · {r.order.user.email}
                </div>

                {r.adminNote && (
                  <div style={{ marginTop: 8, padding: 10, background: 'var(--danger-soft)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--danger)' }}>
                    <strong>Note rejet :</strong> {r.adminNote}
                  </div>
                )}

                <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                  <ReviewActions id={r.id} status={r.status} isFeatured={r.isFeatured} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
