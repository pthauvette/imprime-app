/**
 * /admin — dashboard avec real Prisma KPIs.
 *
 * Server Component qui calcule en parallèle :
 *   - Revenue 24h / 7j / MTD (sum amountCents WHERE paidAt >= window)
 *   - Counts par status pour le pipeline panel
 *   - Activity feed depuis OrderEvent.findMany (top 10 recent)
 *   - Revenue chart 30j (group by day)
 */

import Link from 'next/link';
import type { Route } from 'next';
import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import RefreshButton from '@/components/admin/RefreshButton';
import { Icon } from '@/components/ui/Icon';
import type { OrderEventKind } from '@/lib/db/orders';
import { formatCurrency, formatDate } from '@/lib/format';

export const metadata = { title: 'Admin — Tableau de bord' };
export const dynamic = 'force-dynamic';

const EVENT_DOT: Record<OrderEventKind, string> = {
  PAYMENT_SUCCEEDED: 'paid',
  PAYMENT_FAILED: 'failed',
  SINALITE_SUBMITTED: 'submitted',
  SINALITE_STATUS_CHANGED: 'shipped',
  REFUND_ISSUED: 'refund',
  ERROR: 'failed',
  CANCEL_REQUESTED: 'failed',
  MANUAL_ORDER_CREATED: 'submitted',
};

const EVENT_LABEL: Record<OrderEventKind, string> = {
  PAYMENT_SUCCEEDED: 'a payé',
  PAYMENT_FAILED: 'paiement échoué',
  SINALITE_SUBMITTED: 'soumis à Sinalite',
  SINALITE_STATUS_CHANGED: 'statut Sinalite mis à jour',
  REFUND_ISSUED: 'refund émis',
  ERROR: 'erreur',
  CANCEL_REQUESTED: 'annulation demandée',
  MANUAL_ORDER_CREATED: 'commande créée depuis un devis',
};

export default async function AdminDashboard() {
  const { session } = await requireAdminPage();
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(startOfDay.getTime() - 24 * 3600 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000);

  const [
    rev24h, revPrev24h, statusGroups, totalUsers,
    feedEvents, recentOrders, failedOrdersCount,
    pendingWebhooks, revLast30Days, revPrev30Days,
    // Actionable counts pour la nouvelle section "À traiter"
    pendingReviewsCount, deadEmailsCount, retryableEmailsCount,
    newsletterStats, savedConfigsCount,
    last30dOrdersForTop,
  ] = await Promise.all([
    // Round 16 #3 : .catch fallbacks pour éviter 500 dashboard si table
    // manque (migration locale pas appliquée, ou table renommée).
    prisma.order.aggregate({
      where: { paidAt: { gte: startOfDay } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }).catch(() => ({ _sum: { amountCents: 0 }, _count: { _all: 0 } })),
    prisma.order.aggregate({
      where: { paidAt: { gte: yesterdayStart, lt: startOfDay } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }).catch(() => ({ _sum: { amountCents: 0 }, _count: { _all: 0 } })),
    // Round 16 #3 : pas de .catch ici — le type retourné par groupBy est
    // strict (PickEnumerable) et un fallback sur tableau vide casse
    // l'inférence de `reduce` plus bas. Cette query a peu de chances de
    // throw (table Order est core et la migration est appliquée depuis le
    // jour 1) donc on tolère qu'elle propage si DB throw.
    prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.user.count().catch(() => 0),
    prisma.orderEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { order: { include: { user: true } } },
    }).catch(() => []),
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: true },
    }).catch(() => []),
    prisma.order.count({ where: { status: 'FAILED' } }).catch(() => 0),
    prisma.webhookEvent.count().catch(() => 0),
    prisma.order.aggregate({
      where: { paidAt: { gte: thirtyDaysAgo } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }).catch(() => ({ _sum: { amountCents: 0 }, _count: { _all: 0 } })),
    prisma.order.aggregate({
      where: { paidAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }).catch(() => ({ _sum: { amountCents: 0 }, _count: { _all: 0 } })),
    // Defensive try-catches : si les tables ne sont pas encore migrées en
    // prod (cas transient pendant rollout), on retourne 0 plutôt que crash.
    prisma.review.count({ where: { status: 'PENDING' } }).catch(() => 0),
    prisma.emailDelivery.count({ where: { status: 'DEAD' } }).catch(() => 0),
    prisma.emailDelivery.count({ where: { status: 'PENDING', nextAttemptAt: { lte: now } } }).catch(() => 0),
    prisma.newsletterSubscriber.groupBy({
      by: ['status'],
      _count: { _all: true },
    }).catch(() => [] as Array<{ status: string; _count: { _all: number } }>),
    prisma.savedConfig.count().catch(() => 0),
    // Pour le top produits : on récupère itemsSnapshot des orders 30 derniers
    // jours et on agrège côté JS (groupBy SQL marche pas sur le JSON).
    prisma.order.findMany({
      where: { paidAt: { gte: thirtyDaysAgo } },
      select: { itemsSnapshot: true, productSummary: true },
    }).catch(() => []),
  ]);

  const today = (rev24h._sum.amountCents ?? 0) / 100;
  const yesterday = (revPrev24h._sum.amountCents ?? 0) / 100;
  const todayDelta = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : null;

  const ordersToday = rev24h._count._all;
  const ordersYesterday = revPrev24h._count._all;
  const ordersDelta = ordersToday - ordersYesterday;
  const avgBasket = ordersToday > 0 ? today / ordersToday : 0;

  const inProduction = countStatus(statusGroups, ['SUBMITTED', 'IN_PRODUCTION']);
  const incidentCount = countStatus(statusGroups, ['FAILED']);
  const totalOrders = statusGroups.reduce((a, c) => a + c._count._all, 0);
  const incidentRate = totalOrders > 0 ? (incidentCount / totalOrders) * 100 : 0;

  const rev30d = (revLast30Days._sum.amountCents ?? 0) / 100;
  const revPrev = (revPrev30Days._sum.amountCents ?? 0) / 100;
  const rev30dDelta = revPrev > 0 ? Math.round(((rev30d - revPrev) / revPrev) * 100) : null;

  // Group paid orders by day for the chart
  const paidOrders = await prisma.order.findMany({
    where: { paidAt: { gte: thirtyDaysAgo } },
    select: { amountCents: true, paidAt: true },
  });
  const byDay = new Map<string, number>();
  for (let d = 0; d < 30; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() - (29 - d));
    day.setHours(0, 0, 0, 0);
    byDay.set(day.toISOString().slice(0, 10), 0);
  }
  for (const o of paidOrders) {
    if (!o.paidAt) continue;
    const key = o.paidAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + o.amountCents / 100);
  }
  const chartData = Array.from(byDay.entries()).map(([day, val]) => ({ day, val }));
  const maxVal = Math.max(1, ...chartData.map((d) => d.val));

  // Top produits 30 derniers jours — agrège par productId depuis itemsSnapshot
  // (snapshot Phase 2). Si l'order n'a pas de snapshot (vieilles orders),
  // on fallback à productSummary (label libre, moins précis mais comptable).
  const productCount = new Map<string, { count: number; name: string }>();
  for (const o of last30dOrdersForTop) {
    if (o.itemsSnapshot) {
      try {
        const items = JSON.parse(o.itemsSnapshot) as Array<{ productId: number; productName: string }>;
        if (Array.isArray(items)) {
          for (const it of items) {
            if (typeof it.productId !== 'number') continue;
            const key = String(it.productId);
            const existing = productCount.get(key);
            productCount.set(key, {
              count: (existing?.count ?? 0) + 1,
              name: existing?.name ?? it.productName ?? `Produit #${it.productId}`,
            });
          }
          continue;
        }
      } catch {
        // Tombe sur le fallback ci-dessous
      }
    }
    if (o.productSummary) {
      const key = o.productSummary;
      const existing = productCount.get(key);
      productCount.set(key, {
        count: (existing?.count ?? 0) + 1,
        name: existing?.name ?? o.productSummary,
      });
    }
  }
  const topProducts = Array.from(productCount.entries())
    .map(([id, v]) => ({ id, count: v.count, name: v.name }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const maxTopCount = Math.max(1, ...topProducts.map((p) => p.count));

  const newsletterActive = (newsletterStats.find((s) => s.status === 'ACTIVE')?._count._all) ?? 0;
  let newsletterTotal = 0;
  for (const s of newsletterStats) newsletterTotal += s._count._all;

  // À traiter : éléments qui demandent une action admin maintenant. On les
  // tri par sévérité descendante. Les zéros sont gardés pour rassurer
  // ("0 à traiter" est une info utile).
  const todos = [
    {
      kind: 'critical' as const,
      label: 'Commandes échouées',
      count: failedOrdersCount,
      hint: 'À investiguer ou refund manuel',
      href: '/admin/orders?status=FAILED' as Route,
    },
    {
      kind: 'critical' as const,
      label: 'Emails DEAD',
      count: deadEmailsCount,
      hint: 'Max retries atteint — intervention requise',
      href: '/admin/emails?status=DEAD' as Route,
    },
    {
      kind: 'warning' as const,
      label: 'Reviews en modération',
      count: pendingReviewsCount,
      hint: 'Approve / reject avant publication landing',
      href: '/admin/reviews?status=PENDING' as Route,
    },
    {
      kind: 'info' as const,
      label: 'Emails à retry',
      count: retryableEmailsCount,
      hint: 'Prêts pour le prochain run cron',
      href: '/admin/emails?status=PENDING' as Route,
    },
  ];

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="dashboard"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">
              Bonjour, <em style={{ color: 'var(--accent-primary)' }}>{firstName(session?.user?.name ?? session?.user?.email ?? 'admin')}.</em>
            </h1>
            <p className="adm-page-subtitle">
              {formatDate(now.toISOString())} · {totalOrders} commande{totalOrders > 1 ? 's' : ''} au total · {totalUsers} utilisateur{totalUsers > 1 ? 's' : ''}
            </p>
          </div>
          <div className="adm-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RefreshButton />
            <span className="adm-pulse">Live · Sinalite · Stripe · SES</span>
          </div>
        </header>

        <section className="adm-stats">
          <StatCard
            label="Revenu — aujourd'hui"
            value={formatCurrency(today)}
            trend={todayDelta !== null ? { delta: todayDelta, label: `vs hier · ${ordersToday} commande${ordersToday !== 1 ? 's' : ''}` } : null}
            spark="positive"
          />
          <StatCard
            label="Commandes — aujourd'hui"
            value={String(ordersToday)}
            sub={ordersToday > 0 ? `panier moyen ${formatCurrency(avgBasket)}` : 'rien encore'}
            trend={ordersDelta !== 0 ? { delta: ordersDelta, label: 'vs hier', isCount: true } : null}
            spark="accent"
          />
          <StatCard
            label="Production en cours"
            value={String(inProduction)}
            sub="SUBMITTED + IN_PRODUCTION"
            spark="info"
          />
          <StatCard
            label="Taux d'incident"
            value={`${incidentRate.toFixed(1)} %`}
            sub={`${incidentCount} FAILED · cible < 2 %`}
            spark={incidentRate > 2 ? 'warning' : 'positive'}
          />
        </section>

        <section className="adm-grid-2">
          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Revenu net
                <span className="adm-panel-title-meta">30 derniers jours</span>
              </h2>
              <Link href={'/admin/finances' as Route} className="adm-panel-link">Finances →</Link>
            </div>
            <div className="adm-chart">
              <div className="adm-chart-totals">
                <div>
                  <div className="adm-chart-total-value">{formatCurrency(rev30d)}</div>
                  <div className="adm-chart-total-label">Revenu net 30 j (CAD)</div>
                </div>
                {rev30dDelta !== null && (
                  <div style={{ textAlign: 'right', color: rev30dDelta >= 0 ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, marginLeft: 'auto' }}>
                    {rev30dDelta >= 0 ? '↑' : '↓'} {Math.abs(rev30dDelta)} % vs 30 j précédents
                  </div>
                )}
              </div>
              <RevenueChart data={chartData} maxVal={maxVal} />
              <div className="adm-chart-axis">
                <span>{chartData[0]?.day.slice(5).replace('-', '/')}</span>
                <span>{chartData[Math.floor(chartData.length / 4)]?.day.slice(5).replace('-', '/')}</span>
                <span>{chartData[Math.floor(chartData.length / 2)]?.day.slice(5).replace('-', '/')}</span>
                <span>{chartData[Math.floor(chartData.length * 3 / 4)]?.day.slice(5).replace('-', '/')}</span>
                <span>aujourd'hui</span>
              </div>
            </div>
          </div>

          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Commandes récentes
                <span className="adm-panel-title-meta">5 dernières</span>
              </h2>
              <Link href={'/admin/orders' as Route} className="adm-panel-link">Toutes →</Link>
            </div>
            <div>
              {recentOrders.length === 0 ? (
                <div style={{ padding: '32px 22px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Pas encore de commande. Tes prochaines apparaîtront ici.
                </div>
              ) : recentOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/admin/orders/${o.id}` as Route}
                  style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '12px 22px', borderTop: '1px solid var(--border-subtle)', textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {o.sinaliteOrderId ? `#SIN-${o.sinaliteOrderId}` : `#${o.id.slice(-6).toUpperCase()}`} — {o.shipName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {o.user.email} · {formatDate(o.createdAt.toISOString())}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>
                      {formatCurrency(o.amountCents / 100)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>
                      {o.status}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="adm-grid-2">
          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Activité récente
                <span className="adm-panel-title-meta">flux temps réel</span>
              </h2>
              <Link href={'/admin/orders' as Route} className="adm-panel-link">Tout →</Link>
            </div>
            <div className="adm-feed">
              {feedEvents.length === 0 ? (
                <div style={{ padding: '32px 22px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucun événement encore.
                </div>
              ) : feedEvents.map((e) => {
                const kind = e.kind as OrderEventKind;
                return (
                  <div key={e.id} className="adm-feed-row">
                    <div className={`adm-feed-dot ${EVENT_DOT[kind]}`}>{eventIcon(kind)}</div>
                    <div className="adm-feed-text">
                      <span className="order-ref">
                        {e.order.sinaliteOrderId ? `#SIN-${e.order.sinaliteOrderId}` : `#${e.order.id.slice(-6).toUpperCase()}`}
                      </span>{' '}
                      <strong>{e.order.user.email.split('@')[0]}</strong> · {EVENT_LABEL[kind]} ·{' '}
                      <span className="muted">{formatCurrency(e.order.amountCents / 100)}</span>
                    </div>
                    <span className="adm-feed-time">{relativeTime(e.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Pipeline
                <span className="adm-panel-title-meta">{totalOrders} commandes</span>
              </h2>
            </div>
            <div className="adm-status-grid">
              <PipelineRow label="Payée" color="var(--info)" max={totalOrders} count={countStatus(statusGroups, ['PAID'])} />
              <PipelineRow label="Soumise" color="var(--accent-primary)" max={totalOrders} count={countStatus(statusGroups, ['SUBMITTED'])} />
              <PipelineRow label="Production" color="var(--warning)" max={totalOrders} count={countStatus(statusGroups, ['IN_PRODUCTION'])} />
              <PipelineRow label="Expédiée" color="var(--success)" max={totalOrders} count={countStatus(statusGroups, ['SHIPPED'])} />
              <PipelineRow label="Livrée" color="var(--text-muted)" max={totalOrders} count={countStatus(statusGroups, ['DELIVERED'])} />
              <PipelineRow label="Échec" color="var(--danger)" max={totalOrders} count={countStatus(statusGroups, ['FAILED', 'CANCELLED'])} />
            </div>
          </div>
        </section>

        <section className="adm-grid-2">
          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                À traiter
                <span className="adm-panel-title-meta">queue admin</span>
              </h2>
            </div>
            <div>
              {todos.map((t) => {
                const color =
                  t.kind === 'critical' ? 'var(--danger, #DC2626)' :
                  t.kind === 'warning' ? 'var(--warning, #D97706)' :
                  'var(--info, #2563EB)';
                return (
                  <Link
                    key={t.label}
                    href={t.href}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '44px 1fr auto',
                      gap: 14,
                      padding: '14px 22px',
                      borderTop: '1px solid var(--border-subtle)',
                      textDecoration: 'none',
                      color: 'inherit',
                      alignItems: 'center',
                      opacity: t.count === 0 ? 0.55 : 1,
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, display: 'grid', placeItems: 'center',
                      background: t.count > 0 ? color : 'var(--bg-sunken)',
                      color: t.count > 0 ? '#fff' : 'var(--text-muted)',
                      borderRadius: '50%',
                      fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                    }}>
                      {t.count}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.hint}</div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.count > 0 ? 'Traiter →' : <Icon name="check" size={14} />}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Top produits
                <span className="adm-panel-title-meta">30 derniers jours</span>
              </h2>
              <Link href={'/admin/products' as Route} className="adm-panel-link">Catalogue →</Link>
            </div>
            <div>
              {topProducts.length === 0 ? (
                <div style={{ padding: '32px 22px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucun produit vendu dans les 30 derniers jours.
                </div>
              ) : topProducts.map((p, i) => {
                const pct = (p.count / maxTopCount) * 100;
                return (
                  <div key={p.id} style={{ padding: '12px 22px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {p.count} item{p.count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ marginTop: 8, height: 4, background: 'var(--bg-sunken)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent-primary)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="adm-grid-2">
          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Newsletter
                <span className="adm-panel-title-meta">CASL-compliant</span>
              </h2>
              <Link href={'/admin/newsletter' as Route} className="adm-panel-link">Voir →</Link>
            </div>
            <div style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, lineHeight: 1, color: 'var(--accent-primary)', fontWeight: 400 }}>
                  {newsletterActive}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Abonnés actifs
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, lineHeight: 1, color: 'var(--text-primary)', fontWeight: 400 }}>
                  {newsletterTotal}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Total ({newsletterTotal - newsletterActive} désabonnés)
                </div>
              </div>
            </div>
          </div>

          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Engagement
                <span className="adm-panel-title-meta">utilisation features</span>
              </h2>
            </div>
            <div style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, lineHeight: 1, color: 'var(--accent-primary)', fontWeight: 400 }}>
                  {savedConfigsCount}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Configs sauvées
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, lineHeight: 1, color: 'var(--text-primary)', fontWeight: 400 }}>
                  {totalUsers}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Utilisateurs total
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function StatCard({
  label, value, sub, trend, spark,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: { delta: number; label: string; isCount?: boolean } | null;
  spark?: 'positive' | 'accent' | 'info' | 'warning';
}) {
  const sparkColor = {
    positive: 'var(--success)',
    accent: 'var(--accent-primary)',
    info: 'var(--info)',
    warning: 'var(--warning)',
  }[spark ?? 'accent'];
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value">{value}</div>
      {sub && !trend && <div className="adm-stat-trend neutral">{sub}</div>}
      {trend && (
        <div className={`adm-stat-trend ${trend.delta >= 0 ? 'up' : 'down'}`}>
          {trend.delta >= 0 ? '↑' : '↓'} {trend.isCount ? Math.abs(trend.delta) : `${Math.abs(trend.delta)} %`} {trend.label}
        </div>
      )}
      <svg className="adm-stat-spark" viewBox="0 0 80 26" preserveAspectRatio="none">
        <polyline points="0,18 10,16 20,18 30,12 40,14 50,10 60,8 70,12 80,6" fill="none" stroke={sparkColor} strokeWidth={1.5} />
      </svg>
    </div>
  );
}

function PipelineRow({ label, color, count, max }: { label: string; color: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="adm-status-row">
      <span className="adm-status-label">
        <span className="adm-status-dot" style={{ background: color }}></span>
        {label}
      </span>
      <div className="adm-status-bar">
        <div className="adm-status-bar-fill" style={{ width: `${Math.max(2, pct)}%`, background: color }}></div>
      </div>
      <span className="adm-status-count">{count}</span>
    </div>
  );
}

function RevenueChart({ data, maxVal }: { data: { day: string; val: number }[]; maxVal: number }) {
  if (data.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Pas encore de données — premier paiement traçable apparaîtra ici.
      </div>
    );
  }
  const W = 600, H = 200;
  const stepX = W / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => `${(i * stepX).toFixed(1)},${(H - (d.val / maxVal) * (H - 12)).toFixed(1)}`);
  const path = `M${pts.join(' L')}`;
  const areaPath = `M0,${H} L${pts.join(' L')} L${W},${H} Z`;
  const lastIdx = data.length - 1;
  const lastX = (lastIdx * stepX).toFixed(1);
  const lastY = (H - (data[lastIdx].val / maxVal) * (H - 12)).toFixed(1);
  return (
    <svg className="adm-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1={0} y1={40} x2={W} y2={40} stroke="var(--border-subtle)" strokeDasharray="2 4" />
      <line x1={0} y1={100} x2={W} y2={100} stroke="var(--border-subtle)" strokeDasharray="2 4" />
      <line x1={0} y1={160} x2={W} y2={160} stroke="var(--border-subtle)" strokeDasharray="2 4" />
      <defs>
        <linearGradient id="rev-grad" x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.24} />
          <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#rev-grad)" />
      <path d={path} fill="none" stroke="var(--accent-primary)" strokeWidth={2} />
      <circle cx={lastX} cy={lastY} r={4} fill="var(--accent-primary)" />
      <circle cx={lastX} cy={lastY} r={8} fill="none" stroke="var(--accent-primary)" strokeOpacity={0.3} strokeWidth={2} />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function countStatus(groups: { status: string; _count: { _all: number } }[], wanted: string[]): number {
  return groups.filter((g) => wanted.includes(g.status)).reduce((a, c) => a + c._count._all, 0);
}

function firstName(s: string): string {
  return (s.split(' ')[0] ?? s.split('@')[0] ?? 'admin').replace(/[^a-zA-Zàâäéèêëîïôöùûüç]/g, '') || 'admin';
}

function eventIcon(k: OrderEventKind): string {
  return {
    PAYMENT_SUCCEEDED: '$',
    PAYMENT_FAILED: '✕',
    SINALITE_SUBMITTED: '→',
    SINALITE_STATUS_CHANGED: '↗',
    REFUND_ISSUED: '↩',
    ERROR: '!',
    CANCEL_REQUESTED: '⚠',
    MANUAL_ORDER_CREATED: '✎',
  }[k] ?? '·';
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `il y a ${day} j`;
  return formatDate(d.toISOString());
}
