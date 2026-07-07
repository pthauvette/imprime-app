/**
 * /admin/reviews — Moderation reviews customer.
 *
 * Liste les reviews PENDING en premier (urgents), puis APPROVED puis
 * REJECTED. Actions inline : approve, reject (avec raison), toggle
 * featured (top-3 sur landing).
 */

import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminPagination from '@/components/admin/AdminPagination';
import ReviewsBulkList, { type ReviewListItem } from './ReviewsBulkList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Reviews' };

const PER_PAGE = 25;

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { session } = await requireAdminPage();
  const sp = await searchParams;
  const filter = ['PENDING', 'APPROVED', 'REJECTED'].includes(sp.status ?? '') ? sp.status! : 'PENDING';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const [reviews, totalForFilter, counts, orders, users] = await Promise.all([
    prisma.review.findMany({
      where: { status: filter },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        order: {
          select: { sinaliteOrderId: true, productSummary: true, amountCents: true, user: { select: { email: true } } },
        },
      },
    }),
    prisma.review.count({ where: { status: filter } }),
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

        {/* List + bulk actions */}
        <ReviewsBulkList
          filter={filter}
          reviews={reviews.map((r): ReviewListItem => ({
            id: r.id,
            rating: r.rating,
            displayName: r.displayName,
            comment: r.comment,
            status: r.status,
            isFeatured: r.isFeatured,
            adminNote: r.adminNote,
            // Round 25 #4 — reply Trustpilot-style
            adminReply: r.adminReply ?? null,
            adminReplyAt: r.adminReplyAt?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
            orderId: r.orderId,
            order: {
              sinaliteOrderId: r.order.sinaliteOrderId,
              productSummary: r.order.productSummary,
              amountCents: r.order.amountCents,
              user: { email: r.order.user.email },
            },
          }))}
        />
        <AdminPagination
          page={page}
          total={totalForFilter}
          perPage={PER_PAGE}
          baseHref="/admin/reviews"
          extraParams={{ status: filter }}
        />
      </main>
    </div>
  );
}
