/**
 * /admin/users — Liste utilisateurs avec stats + filtres + pagination réels.
 *
 * Server Component → query Prisma directement. searchParams contrôlent
 * filter/q/page. Le compte "guest" est inféré : un user est considéré guest
 * s'il n'a aucun Account (auth provider) ET que emailVerified est null. Pour
 * MVP on simplifie : guest = emailVerified === null.
 */

import Link from 'next/link';
import type { Route } from 'next';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { prisma } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin-auth';
import { formatCurrency, formatDate } from '@/lib/format';
import UserBulkBar from './UserBulkBar';

export const metadata = { title: 'Admin — Utilisateurs' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type UserFilter = 'all' | 'authenticated' | 'guest' | 'high-value' | 'inactive';

const HIGH_VALUE_CENTS = 100_000; // 1000 $ LTV → high-value
const INACTIVE_DAYS = 90;

interface SP {
  filter?: string;
  q?: string;
  page?: string;
  /** Round 22 #1 — filter reseller status indépendant du `filter` principal */
  reseller?: string;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { session } = await requireAdminPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const filter: UserFilter = (
    ['all', 'authenticated', 'guest', 'high-value', 'inactive'] as const
  ).includes((sp.filter ?? 'all') as UserFilter)
    ? ((sp.filter ?? 'all') as UserFilter)
    : 'all';
  const search = (sp.q ?? '').trim();
  // Round 22 #1 — reseller filter : 'verified' | 'auto' | 'any-reseller' | undefined
  const resellerFilter = sp.reseller && ['verified', 'auto', 'any-reseller'].includes(sp.reseller)
    ? sp.reseller as 'verified' | 'auto' | 'any-reseller'
    : null;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const inactiveCutoff = new Date(now.getTime() - INACTIVE_DAYS * 24 * 3600 * 1000);

  // ─── Parallel stats + filter counts ────────────────────────────────────
  const [
    totalCount,
    new7dCount,
    new7dPrev,
    guestCount,
    authenticatedCount,
    withOrdersAgg,
    sidebarOrders,
    sidebarWebhooks,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({
      where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
    prisma.user.count({ where: { emailVerified: null } }),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.order.groupBy({
      by: ['userId'],
      _sum: { amountCents: true },
    }),
    prisma.order.count(),
    prisma.webhookEvent.count(),
  ]);

  // Map userId → { totalCents, orderCount } (rebuild for both stats + render)
  const ltvByUser = new Map<string, number>();
  for (const row of withOrdersAgg) {
    ltvByUser.set(row.userId, row._sum.amountCents ?? 0);
  }
  const withOrdersCount = withOrdersAgg.length;
  const highValueCount = withOrdersAgg.filter(
    (r) => (r._sum.amountCents ?? 0) >= HIGH_VALUE_CENTS,
  ).length;

  // ─── Inactive count (no order in 90+ days) ──────────────────────────────
  // We approximate: users with NO orders at all OR with latest order older than 90d.
  // For MVP we just count users with no recent order — done via subquery.
  const inactiveCount = await prisma.user.count({
    where: {
      OR: [
        { orders: { none: {} } },
        { orders: { every: { createdAt: { lt: inactiveCutoff } } } },
      ],
    },
  });

  // ─── Build WHERE for the actual listing ─────────────────────────────────
  type UserWhere = NonNullable<NonNullable<Parameters<typeof prisma.user.findMany>[0]>['where']>;
  const whereParts: UserWhere[] = [];
  if (filter === 'authenticated') {
    whereParts.push({ emailVerified: { not: null } });
  } else if (filter === 'guest') {
    whereParts.push({ emailVerified: null });
  } else if (filter === 'inactive') {
    whereParts.push({
      OR: [
        { orders: { none: {} } },
        { orders: { every: { createdAt: { lt: inactiveCutoff } } } },
      ],
    });
  }
  if (search) {
    whereParts.push({
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { name: { contains: search, mode: 'insensitive' as const } },
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName: { contains: search, mode: 'insensitive' as const } },
      ],
    });
  }
  // Round 22 #1 — reseller filter additif (stacking avec other filters)
  if (resellerFilter === 'verified') {
    whereParts.push({ resellerStatus: 'VERIFIED' });
  } else if (resellerFilter === 'auto') {
    whereParts.push({ resellerStatus: 'AUTO_DETECTED' });
  } else if (resellerFilter === 'any-reseller') {
    whereParts.push({ resellerStatus: { in: ['AUTO_DETECTED', 'VERIFIED'] } });
  }
  const where: UserWhere = whereParts.length === 0 ? {} : { AND: whereParts };

  // ─── Fetch the page ─────────────────────────────────────────────────────
  // We fetch a larger page candidate for high-value because the filter is
  // applied post-fetch (no SQL aggregate filter without raw query).
  const isHighValue = filter === 'high-value';
  const fetchSize = isHighValue ? PAGE_SIZE * 8 : PAGE_SIZE;
  const fetchSkip = isHighValue ? 0 : (page - 1) * PAGE_SIZE;

  const rawUsers = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: fetchSkip,
    take: fetchSize,
    include: {
      _count: { select: { orders: true } },
      orders: {
        select: {
          id: true,
          createdAt: true,
          shipProvince: true,
          shipCity: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  // Apply high-value filter post-fetch (LTV is in-memory map).
  let users = rawUsers;
  let filteredTotal = isHighValue ? null : 0;
  if (isHighValue) {
    users = rawUsers.filter((u) => (ltvByUser.get(u.id) ?? 0) >= HIGH_VALUE_CENTS);
    filteredTotal = users.length;
    users = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }
  // Audit admin 2026-07 §8.4 — le filtre LTV est appliqué post-fetch sur les
  // fetchSize (400) users les plus RÉCENTS : au-delà, un gros client historique
  // disparaît silencieusement de la vue ET du count. Tant que la LTV n'est pas
  // calculée côté SQL, on l'affiche honnêtement (bandeau) au lieu de le taire.
  const highValueTruncated = isHighValue && rawUsers.length === fetchSize;

  // ─── Compute total for pagination ───────────────────────────────────────
  const listTotal = isHighValue
    ? filteredTotal ?? 0
    : await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));

  // ─── Filter pills counts ───────────────────────────────────────────────
  const filterCounts: Record<UserFilter, number> = {
    all: totalCount,
    authenticated: authenticatedCount,
    guest: guestCount,
    'high-value': highValueCount,
    inactive: inactiveCount,
  };
  const filterLabels: Record<UserFilter, string> = {
    all: 'Tous',
    authenticated: 'Authentifiés',
    guest: 'Guest',
    'high-value': 'High-value',
    inactive: 'Inactifs 90j+',
  };

  const newDelta = new7dPrev > 0
    ? new7dCount - new7dPrev
    : new7dCount > 0 ? new7dCount : 0;

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="users"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Utilisateurs</h1>
            <p className="adm-page-subtitle">
              {totalCount} inscrit{totalCount > 1 ? 's' : ''} · {withOrdersCount} avec commandes · {guestCount} guest
            </p>
          </div>
          <div className="adm-topbar-actions">
            <Link href={'/admin' as Route} className="btn btn-secondary btn-sm">↗ Dashboard</Link>
          </div>
        </header>

        {/* ─── Stats ─────────────────────────────────────────────── */}
        <section className="usr-stats">
          <div className="usr-stat">
            <div className="usr-stat-label">Total inscrits</div>
            <div className="usr-stat-value">{totalCount}<span className="unit">comptes</span></div>
            <div className={new7dCount > 0 ? 'usr-stat-meta up' : 'usr-stat-meta'}>
              {new7dCount > 0 ? `↑ ${new7dCount} nouveaux · 7 j` : 'aucun nouveau · 7 j'}
            </div>
          </div>
          <div className="usr-stat">
            <div className="usr-stat-label">Avec commandes</div>
            <div className="usr-stat-value">{withOrdersCount}<span className="unit">acheteurs</span></div>
            <div className="usr-stat-meta">
              {totalCount > 0 ? `Taux conv. ${Math.round((withOrdersCount / totalCount) * 100)} %` : '—'}
            </div>
          </div>
          <div className="usr-stat">
            <div className="usr-stat-label">Guest checkout</div>
            <div className="usr-stat-value">{guestCount}<span className="unit">non-vérifiés</span></div>
            <div className="usr-stat-meta">{Math.max(0, guestCount - authenticatedCount > 0 ? 0 : 0)} en attente</div>
          </div>
          <div className="usr-stat">
            <div className="usr-stat-label">Nouveaux · 7 j</div>
            <div className="usr-stat-value">{new7dCount}<span className="unit">inscriptions</span></div>
            <div className={newDelta > 0 ? 'usr-stat-meta up' : 'usr-stat-meta'}>
              {newDelta > 0 ? `↑ +${newDelta} vs semaine précédente` : newDelta < 0 ? `↓ ${newDelta} vs semaine précédente` : '— vs semaine précédente'}
            </div>
          </div>
        </section>

        {/* ─── Filter bar ────────────────────────────────────────── */}
        <div className="usr-filterbar">
          <div className="usr-pills">
            {(['all', 'authenticated', 'guest', 'high-value', 'inactive'] as UserFilter[]).map((key) => {
              const params = new URLSearchParams();
              if (key !== 'all') params.set('filter', key);
              if (search) params.set('q', search);
              if (resellerFilter) params.set('reseller', resellerFilter);
              const href = `/admin/users${params.toString() ? '?' + params.toString() : ''}`;
              return (
                <Link
                  key={key}
                  href={href as Route}
                  className={`usr-pill${filter === key ? ' active' : ''}`}
                >
                  {filterLabels[key]} <span className="usr-pill-count">{filterCounts[key]}</span>
                </Link>
              );
            })}
          </div>
          <form action="/admin/users" method="get" className="usr-search">
            {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
            {resellerFilter && <input type="hidden" name="reseller" value={resellerFilter} />}
            <svg className="usr-search-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <circle cx={7} cy={7} r={5} />
              <path d="M11 11l3 3" />
            </svg>
            <input type="text" name="q" defaultValue={search} placeholder="Cherche par nom, email…" />
            <span className="usr-search-kbd">↵</span>
          </form>
        </div>

        {/* Round 22 #1 — Reseller filter sub-row (additif au filter principal) */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
            Reseller
          </span>
          {([
            { key: null as null | 'verified' | 'auto' | 'any-reseller', label: 'Tous' },
            { key: 'any-reseller' as const, label: 'Resellers' },
            { key: 'verified' as const, label: '✓ Vérifiés' },
            { key: 'auto' as const, label: '~ Auto-détectés' },
          ]).map((opt) => {
            const params = new URLSearchParams();
            if (filter !== 'all') params.set('filter', filter);
            if (search) params.set('q', search);
            if (opt.key) params.set('reseller', opt.key);
            const href = `/admin/users${params.toString() ? '?' + params.toString() : ''}`;
            const active = resellerFilter === opt.key;
            return (
              <Link
                key={opt.key ?? 'all'}
                href={href as Route}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  background: active ? 'var(--accent-primary)' : 'var(--bg-sunken)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  borderRadius: 'var(--r-pill)',
                  textDecoration: 'none',
                  fontWeight: active ? 700 : 500,
                }}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        {/* Audit §8.4 — troncature honnête du filtre high-value */}
        {highValueTruncated && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--warning-soft, #fef9ec)', border: '1px solid var(--warning, #d97706)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--warning, #b45309)' }}>
            ⚠ Vue partielle : la LTV n&apos;est évaluée que sur les {fetchSize} comptes les plus récents.
            Un gros client plus ancien peut manquer — affine avec la recherche si tu cherches un compte précis.
          </div>
        )}

        {/* ─── Table ───────────────────────────────────────────── */}
        <div className="usr-panel">
          {users.length === 0 ? (
            <EmptyState />
          ) : (
            <table className="usr-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 36 }}>
                    {/* Select-all checkbox — no data-user-id so UserBulkBar
                        treats it as toggle-all */}
                    <input type="checkbox" className="usr-checkbox" aria-label="Tout sélectionner" />
                  </th>
                  <th scope="col">Utilisateur</th>
                  <th scope="col">Inscrit le</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Commandes</th>
                  <th scope="col" style={{ textAlign: 'right' }}>LTV</th>
                  <th scope="col">Dernière commande</th>
                  <th scope="col">Status auth</th>
                  <th scope="col">Rôle</th>
                  <th scope="col">Province</th>
                  <th scope="col" className="actions-col"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const initials = userInitials(u.name, u.email);
                  const ltvCents = ltvByUser.get(u.id) ?? 0;
                  const lastOrder = u.orders[0];
                  const isGuest = u.emailVerified === null;
                  const isHigh = ltvCents >= HIGH_VALUE_CENTS;
                  const colorIdx = (idx % 5) + 1; // a1..a5
                  return (
                    <tr key={u.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="usr-checkbox"
                          data-user-id={u.id}
                          aria-label={`Sélectionner ${u.email}`}
                        />
                      </td>
                      <td>
                        <div className="usr-cell-name">
                          <div className={`usr-avatar ${isGuest ? 'guest' : `a${colorIdx}`}`}>
                            {isGuest ? 'G' : initials}
                          </div>
                          <div>
                            <div className={`name${isGuest ? ' guest' : ''}`}>
                              {u.name ?? formatNameFallback(u) ?? u.email.split('@')[0]}
                              {isGuest && ' · guest'}
                            </div>
                            <div className="email">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="usr-date">{formatDate(u.createdAt.toISOString())}</td>
                      <td className="usr-orders" style={{ textAlign: 'right' }}>{u._count.orders}</td>
                      <td className={`usr-ltv${isHigh ? ' high' : ''}`} style={{ textAlign: 'right' }}>
                        {ltvCents > 0 ? formatCurrency(ltvCents / 100) : '—'}
                      </td>
                      <td className="usr-date">
                        {lastOrder ? formatDate(lastOrder.createdAt.toISOString()) : '—'}
                      </td>
                      <td>
                        <span className={`usr-status ${isGuest ? 'guest' : 'verified'}`}>
                          {isGuest ? 'Guest' : 'Vérifié'}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            letterSpacing: '0.06em',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-pill)',
                            background: u.role === 'ADMIN' ? 'var(--accent-soft)' : 'var(--bg-sunken)',
                            color: u.role === 'ADMIN' ? 'var(--accent-primary)' : 'var(--text-muted)',
                            fontWeight: 600,
                          }}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="usr-province">
                        {lastOrder ? (
                          <>
                            {lastOrder.shipCity} <span className="code">{lastOrder.shipProvince}</span>
                          </>
                        ) : '—'}
                      </td>
                      <td className="actions-col">
                        <Link href={`/admin/users/${u.id}` as Route} className="usr-actions-btn">→</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {listTotal > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={listTotal}
              filter={filter}
              search={search}
            />
          )}
        </div>

        {/* Sticky bulk action bar — Client Component qui s'attache aux
            checkboxes via DOM (data-user-id). Toujours visible (Export CSV
            est dispo même sans sélection). */}
        <UserBulkBar />
      </main>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function userInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || email.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function formatNameFallback(u: { firstName: string | null; lastName: string | null }): string | null {
  const fn = u.firstName?.trim();
  const ln = u.lastName?.trim();
  if (!fn && !ln) return null;
  return [fn, ln].filter(Boolean).join(' ');
}

function EmptyState() {
  return (
    <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 400 }}>
        Aucun utilisateur
      </h2>
      <p style={{ fontSize: 14, margin: 0 }}>
        Ajuste tes filtres ou attends qu'un client passe sa première commande.
      </p>
    </div>
  );
}

function Pagination({
  page, totalPages, totalCount, filter, search,
}: {
  page: number; totalPages: number; totalCount: number;
  filter: UserFilter; search: string;
}) {
  const buildHref = (p: number): Route => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('filter', filter);
    if (search) params.set('q', search);
    if (p > 1) params.set('page', String(p));
    return `/admin/users${params.toString() ? '?' + params.toString() : ''}` as Route;
  };

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="usr-pagination">
      <div className="usr-pagination-left">
        Affiché <strong style={{ color: 'var(--text-primary)' }}>{from}–{to}</strong> sur <strong style={{ color: 'var(--text-primary)' }}>{totalCount}</strong>
      </div>
      <div className="usr-pagination-right">
        {page > 1 ? (
          <Link href={buildHref(page - 1)} className="usr-pagination-btn">‹</Link>
        ) : (
          <button className="usr-pagination-btn" disabled>‹</button>
        )}
        <div className="usr-pagination-page">
          <span className="usr-pagination-btn current">{page}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 8px' }}>sur {totalPages}</span>
        </div>
        {page < totalPages ? (
          <Link href={buildHref(page + 1)} className="usr-pagination-btn">›</Link>
        ) : (
          <button className="usr-pagination-btn" disabled>›</button>
        )}
      </div>
    </div>
  );
}
