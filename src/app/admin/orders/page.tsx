/**
 * /admin/orders — All orders table avec filtres + pagination réels.
 *
 * Server Component → query Prisma directement. searchParams contrôlent
 * status/search/page. La page revisite la DB à chaque navigation (forces
 * dynamic rendering — ce qu'on veut pour un dashboard admin live).
 */

import Link from 'next/link';
import type { Route } from 'next';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { prisma } from '@/lib/db';
import { ORDER_STATUS, type OrderStatus } from '@/lib/db/orders';
import { requireAdminPage } from '@/lib/admin-auth';
import { getAdminSidebarCounts } from '@/lib/admin/sidebar-counts';
import { computeOrderSlaMetrics } from '@/lib/admin/order-sla';
import { formatCurrency, formatDate } from '@/lib/format';
import OrderBulkBar from './OrderBulkBar';
import OrderSlaWidget from '@/components/admin/OrderSlaWidget';
import SavedFiltersBar from '@/components/admin/SavedFiltersBar';

export const metadata = { title: 'Admin — Commandes' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  PAID: 'Payée',
  SUBMITTED: 'Soumise',
  IN_PRODUCTION: 'En production',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  FAILED: 'Échec',
};

const STATUS_CLASS: Record<OrderStatus, string> = {
  PENDING: 'submitted',
  PAID: 'paid',
  SUBMITTED: 'submitted',
  IN_PRODUCTION: 'production',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'failed',
  FAILED: 'failed',
};

interface SP {
  status?: string;
  q?: string;
  page?: string;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { session } = await requireAdminPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const filterStatus = (ORDER_STATUS as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as OrderStatus)
    : null;
  const search = (sp.q ?? '').trim();

  // ─── WHERE clause ──────────────────────────────────────────────────────
  const where: Parameters<typeof prisma.order.findMany>[0] extends infer F
    ? F extends { where?: infer W } ? W : never
    : never = {
    ...(filterStatus ? { status: filterStatus } : {}),
    ...(search ? {
      OR: [
        { sinaliteOrderId: { contains: search } },
        { id: { contains: search } },
        { shipName: { contains: search, mode: 'insensitive' as const } },
        { user: { email: { contains: search, mode: 'insensitive' as const } } },
      ],
    } : {}),
  };

  // ─── Parallel queries ──────────────────────────────────────────────────
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [orders, totalCount, statusCounts, statsToday, stats7d, stats30d, pendingAction, slaMetrics, savedFilters] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true } } },
    }),
    prisma.order.count({ where }),
    prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { paidAt: { gte: startOfDay } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { paidAt: { gte: sevenDaysAgo } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { paidAt: { gte: startOfMonth } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.order.count({
      where: { status: { in: ['PENDING', 'PAID', 'FAILED'] } },
    }),
    // Round 25 #3 — SLA widget (P50/P95 time-to-submit + time-to-ship).
    // .catch fallback : si la query échoue (Prisma down, schema drift),
    // on render le widget vide plutôt que de cracher toute la page.
    computeOrderSlaMetrics().catch(() => ({
      windowDays: 30,
      computedAt: new Date(),
      timeToSubmit: { sampleSize: 0, p50Hours: null, p95Hours: null },
      timeToShip: { sampleSize: 0, p50Hours: null, p95Hours: null },
    })),
    // Round 26 #5 — filtres bookmarkés per-admin pour cette page.
    // .catch fallback : si la table n'existe pas encore (migration pas
    // appliquée), on render avec [] (le bar reste fonctionnel via API).
    session?.user?.id
      ? prisma.adminSavedFilter.findMany({
          where: { userId: session.user.id, scope: 'orders' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, queryString: true, createdAt: true },
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const countByStatus = (s: OrderStatus | null) => {
    if (s === null) return statusCounts.reduce((a, c) => a + c._count._all, 0);
    return statusCounts.find((c) => c.status === s)?._count._all ?? 0;
  };

  // ─── Build filter pills ────────────────────────────────────────────────
  const pills: { key: OrderStatus | null; label: string; count: number }[] = [
    { key: null, label: 'Tous', count: countByStatus(null) },
    { key: 'PAID', label: 'Payée', count: countByStatus('PAID') },
    { key: 'SUBMITTED', label: 'Soumise', count: countByStatus('SUBMITTED') },
    { key: 'IN_PRODUCTION', label: 'Production', count: countByStatus('IN_PRODUCTION') },
    { key: 'SHIPPED', label: 'Expédiée', count: countByStatus('SHIPPED') },
    { key: 'DELIVERED', label: 'Livrée', count: countByStatus('DELIVERED') },
    { key: 'FAILED', label: 'Échec', count: countByStatus('FAILED') + countByStatus('CANCELLED') },
  ];

  // Round 15 #3 : counts dynamiques via helper (templates/products/webhooks
  // étaient hardcoded 3/468/3 avant). On override `orders` avec la valeur
  // déjà calculée pour cette page.
  const sidebarCountsBase = await getAdminSidebarCounts();
  const sidebarCounts = {
    ...sidebarCountsBase,
    orders: countByStatus(null),
  };

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="orders"
        counts={sidebarCounts}
        urgents={{ webhooks: true }}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Commandes</h1>
            <p className="adm-page-subtitle">
              {totalCount} au total · {countByStatus('PAID') + countByStatus('SUBMITTED') + countByStatus('IN_PRODUCTION')} actives
            </p>
          </div>
          <div className="adm-topbar-actions" style={{ display: 'flex', gap: 8 }}>
            <Link href={'/admin/orders/quick-link' as Route} className="btn btn-secondary btn-sm">+ Commande téléphonique</Link>
            <a
              href={(() => {
                const params = new URLSearchParams();
                if (filterStatus) params.set('status', filterStatus);
                const qs = params.toString();
                return `/api/admin/orders/export${qs ? '?' + qs : ''}`;
              })()}
              download
              className="btn btn-secondary btn-sm"
              title="Exporter les commandes filtrées en CSV pour comptabilité"
            >
              ⬇ Export CSV
            </a>
            <Link href={'/admin' as Route} className="btn btn-secondary btn-sm">↗ Dashboard</Link>
          </div>
        </header>

        {/* ─── Round 26 #5 — Saved filters bar (admin productivity) ── */}
        <div style={{ marginBottom: 12 }}>
          <SavedFiltersBar
            scope="orders"
            basePath="/admin/orders"
            initialFilters={savedFilters.map((f) => ({
              id: f.id,
              name: f.name,
              queryString: f.queryString,
              createdAt: f.createdAt.toISOString(),
            }))}
          />
        </div>

        {/* ─── SLA widget (Round 25 #3) ────────────────────────────── */}
        <OrderSlaWidget metrics={slaMetrics} />

        {/* ─── Stats row ──────────────────────────────────────────── */}
        <section className="ord-stats">
          <div className="ord-stat">
            <div className="ord-stat-label">Aujourd'hui</div>
            <div className="ord-stat-value">{formatMoney(statsToday._sum.amountCents)}</div>
            <div className="ord-stat-meta">{statsToday._count._all} commandes</div>
          </div>
          <div className="ord-stat">
            <div className="ord-stat-label">7 derniers jours</div>
            <div className="ord-stat-value">{formatMoney(stats7d._sum.amountCents)}</div>
            <div className="ord-stat-meta">{stats7d._count._all} commandes</div>
          </div>
          <div className="ord-stat">
            <div className="ord-stat-label">Ce mois-ci</div>
            <div className="ord-stat-value">{formatMoney(stats30d._sum.amountCents)}</div>
            <div className="ord-stat-meta">{stats30d._count._all} commandes</div>
          </div>
          <div className="ord-stat">
            <div className="ord-stat-label">En attente d'action</div>
            <div className="ord-stat-value">{pendingAction}</div>
            <div className={pendingAction > 0 ? 'ord-stat-meta warn' : 'ord-stat-meta'}>
              {pendingAction > 0 ? 'PENDING / PAID / FAILED' : 'tout est fluide'}
            </div>
          </div>
        </section>

        {/* ─── Filter pills + search ──────────────────────────────── */}
        <section className="ord-panel" style={{ marginBottom: 16 }}>
          <div className="ord-pills" role="tablist">
            {pills.map((p) => {
              const params = new URLSearchParams();
              if (p.key) params.set('status', p.key);
              if (search) params.set('q', search);
              const href = `/admin/orders${params.toString() ? '?' + params.toString() : ''}`;
              const isActive = (p.key === null && !filterStatus) || p.key === filterStatus;
              return (
                <Link
                  key={p.key ?? 'all'}
                  href={href as Route}
                  className={`ord-pill${isActive ? ' active' : ''}`}
                >
                  {p.label}
                  <span className="ord-pill-count">{p.count}</span>
                </Link>
              );
            })}
          </div>

          <form action="/admin/orders" method="get" className="ord-search" style={{ marginTop: 12 }}>
            {filterStatus && <input type="hidden" name="status" value={filterStatus} />}
            <svg className="ord-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx={11} cy={11} r={7} />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={search}
              placeholder="Cherche par #SIN-..., email, nom client..."
            />
            <span className="ord-search-kbd">/</span>
          </form>
        </section>

        {/* ─── Orders table ───────────────────────────────────────── */}
        <section className="ord-panel">
          {orders.length === 0 ? (
            <EmptyState />
          ) : (
            <table className="ord-table">
              <thead>
                <tr>
                  <th className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></th>
                  <th>Order ID</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Qté</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Sinalite</th>
                  <th className="actions-col"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const displayId = order.sinaliteOrderId
                    ? `#SIN-${order.sinaliteOrderId}`
                    : `#${order.id.slice(-6).toUpperCase()}`;
                  const status = order.status as OrderStatus;
                  return (
                    <tr key={order.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="ord-checkbox"
                          data-order-id={order.id}
                          aria-label={`Sélectionner ${displayId}`}
                        />
                      </td>
                      <td>
                        <Link href={`/admin/orders/${order.id}` as Route} style={{ fontWeight: 600 }}>
                          {displayId}
                        </Link>
                      </td>
                      <td className="ord-date-cell">
                        <div className="ord-date">{formatDate(order.createdAt.toISOString())}</div>
                      </td>
                      <td>
                        <div className="ord-customer">
                          <div className="ord-customer-name">{order.shipName}</div>
                          <div className="ord-customer-email">{order.user.email}</div>
                        </div>
                      </td>
                      <td className="ord-qty">{order.itemsCount}</td>
                      <td className="ord-total">{formatCurrency(order.amountCents / 100)}</td>
                      <td>
                        <span className={`ord-status ${STATUS_CLASS[status]}`}>
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td>
                        <span className={order.sinaliteOrderId ? 'ord-sinid' : 'ord-sinid empty'}>
                          {order.sinaliteOrderId ?? '—'}
                        </span>
                      </td>
                      <td>
                        <Link href={`/admin/orders/${order.id}` as Route} className="ord-actions-btn">→</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {totalCount > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              status={filterStatus}
              search={search}
            />
          )}
        </section>

        {/* Sticky bulk action bar — attaches aux .ord-checkbox[data-order-id] */}
        <OrderBulkBar />
      </main>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatMoney(cents: number | null | undefined): string {
  return cents ? formatCurrency(cents / 100) : '0 $';
}

function EmptyState() {
  return (
    <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 400 }}>
        Aucune commande
      </h2>
      <p style={{ fontSize: 14, margin: 0 }}>
        Ajuste tes filtres ou attends la prochaine commande.
      </p>
    </div>
  );
}

function Pagination({
  page, totalPages, totalCount, status, search,
}: {
  page: number; totalPages: number; totalCount: number;
  status: OrderStatus | null; search: string;
}) {
  const buildHref = (p: number): Route => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('q', search);
    if (p > 1) params.set('page', String(p));
    return `/admin/orders${params.toString() ? '?' + params.toString() : ''}` as Route;
  };

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="ord-pagination">
      <div className="ord-pagination-left">
        Affiché <strong>{from}–{to}</strong> sur <strong>{totalCount}</strong>
      </div>
      <div className="ord-pagination-right">
        {page > 1 ? (
          <Link href={buildHref(page - 1)} className="ord-pagination-btn">←</Link>
        ) : (
          <span className="ord-pagination-btn" style={{ opacity: 0.3 }}>←</span>
        )}
        <span className="ord-pagination-page">
          Page <strong>{page}</strong> sur {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={buildHref(page + 1)} className="ord-pagination-btn">→</Link>
        ) : (
          <span className="ord-pagination-btn" style={{ opacity: 0.3 }}>→</span>
        )}
      </div>
    </div>
  );
}
