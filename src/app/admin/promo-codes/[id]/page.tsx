/**
 * /admin/promo-codes/[id] — analytics d'un code promo.
 *
 * Round 17 #4 — montre l'impact d'un code promo :
 *   - Usage : count vs maxUses, taux d'utilisation
 *   - Revenue : total $ généré par les orders avec ce code
 *   - AOV (Average Order Value) avec vs sans ce code (comparison)
 *   - Top 10 users qui ont utilisé le code (impact LTV)
 *   - Timeline 30 derniers jours (orders/jour)
 *
 * Server Component, queries Prisma directement.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatCurrency, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const promo = await prisma.promoCode.findUnique({ where: { id }, select: { code: true } });
  return { title: `Admin — Code ${promo?.code ?? 'promo'} · Plio` };
}

export default async function AdminPromoCodeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requireAdminPage();
  const { id } = await params;

  // Round 44 #2 — promo et globalAovAgg sont mutuellement indépendants
  // (globalAovAgg ne dépend que de `id`) → un seul Promise.all au lieu
  // d'awaits sériels. (Les counts de sidebar sont fetchés par AdminSidebar.)
  // Le notFound() sur promo reste juste après (guard inchangé).
  const [promo, globalAovAgg] = await Promise.all([
    prisma.promoCode.findUnique({
      where: { id },
      include: {
        orders: {
          where: { status: { notIn: ['CANCELLED', 'FAILED'] } },
          select: {
            id: true,
            sinaliteOrderId: true,
            amountCents: true,
            subtotalCents: true,
            discountCents: true,
            paidAt: true,
            createdAt: true,
            status: true,
            user: { select: { id: true, email: true, name: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
    // AOV comparaison : moyenne globale toutes orders (hors ce code).
    prisma.order.aggregate({
      where: {
        status: { notIn: ['CANCELLED', 'FAILED'] },
        promoCodeId: { not: id },
      },
      _avg: { amountCents: true },
      _count: { _all: true },
    }).catch(() => ({ _avg: { amountCents: 0 }, _count: { _all: 0 } })),
  ]);
  if (!promo) notFound();

  // ─── Aggregates ─────────────────────────────────────────────────────────
  const usedOrders = promo.orders;
  const usageCount = usedOrders.length;
  const totalRevenue = usedOrders.reduce((a, o) => a + o.amountCents, 0);
  const totalDiscount = usedOrders.reduce((a, o) => a + o.discountCents, 0);
  const avgOrderValue = usageCount > 0 ? Math.round(totalRevenue / usageCount) : 0;
  const usagePct = promo.maxUses
    ? Math.round((usageCount / promo.maxUses) * 100)
    : null;

  // globalAovAgg résolu ci-dessus en parallèle (Round 44 #2).
  const globalAov = Math.round(globalAovAgg._avg.amountCents ?? 0);
  const aovDelta = globalAov > 0
    ? Math.round(((avgOrderValue - globalAov) / globalAov) * 100)
    : null;

  // Top users par revenue de ce code
  const usersByRevenue = new Map<string, { email: string; name: string; count: number; revenueCents: number }>();
  for (const o of usedOrders) {
    if (!o.user) continue;
    const display = o.user.name ?? [o.user.firstName, o.user.lastName].filter(Boolean).join(' ').trim() ?? o.user.email;
    const existing = usersByRevenue.get(o.user.id) ?? { email: o.user.email, name: display, count: 0, revenueCents: 0 };
    existing.count++;
    existing.revenueCents += o.amountCents;
    usersByRevenue.set(o.user.id, existing);
  }
  const topUsers = Array.from(usersByRevenue.entries())
    .map(([userId, u]) => ({ userId, ...u }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 10);

  // Timeline 30 derniers jours (count par jour)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const dailyMap = new Map<string, number>();
  for (const o of usedOrders) {
    if (!o.paidAt || o.paidAt < thirtyDaysAgo) continue;
    const day = o.paidAt.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const timeline = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));
  const maxDaily = Math.max(1, ...timeline.map(([, n]) => n));

  // ─── Status badge ───────────────────────────────────────────────────────
  const now = new Date();
  const isExpired = promo.expiresAt && promo.expiresAt < now;
  const isExhausted = promo.maxUses && promo.usesCount >= promo.maxUses;
  const statusBadge = !promo.active
    ? { label: 'Désactivé', color: 'var(--text-muted)' }
    : isExpired
      ? { label: 'Expiré', color: 'var(--danger)' }
      : isExhausted
        ? { label: 'Épuisé', color: 'var(--warning, #D97706)' }
        : { label: 'Actif', color: 'var(--success, #16A34A)' };


  return (
    <div className="adm-shell">
      <AdminSidebar
        active="promo-codes"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <nav style={{ marginBottom: 16, fontSize: 12 }}>
          <Link href={'/admin/promo-codes' as Route} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
            ← Tous les codes promo
          </Link>
        </nav>

        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 26, padding: '4px 12px', background: 'var(--accent-soft)', color: 'var(--accent-primary)', borderRadius: 'var(--r-sm)' }}>
                {promo.code}
              </code>
              <span
                style={{
                  padding: '4px 12px',
                  background: statusBadge.color,
                  color: '#fff',
                  borderRadius: 'var(--r-pill)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {statusBadge.label}
              </span>
            </h1>
            <p className="adm-page-subtitle">
              {promo.label ?? <em style={{ color: 'var(--text-muted)' }}>(pas de label)</em>}
              {' · '}
              {promo.discountPct
                ? `${promo.discountPct} % off`
                : promo.discountCents
                  ? `${formatCurrency(promo.discountCents / 100)} off`
                  : 'Discount non set'}
              {promo.firstOrderOnly && ' · 1ère commande uniquement'}
              {promo.minSubtotalCents && ` · min ${formatCurrency(promo.minSubtotalCents / 100)}`}
              {' · créé le '}{formatDate(promo.createdAt.toISOString())}
            </p>
          </div>
        </header>

        {/* ─── KPI cards ───────────────────────────────────────── */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}>
          <KpiCard
            label="Utilisations"
            value={String(usageCount)}
            sub={promo.maxUses
              ? `sur ${promo.maxUses} max (${usagePct}%)`
              : 'aucune limite'}
            highlight
          />
          <KpiCard
            label="Revenu généré"
            value={formatCurrency(totalRevenue / 100)}
            sub={`net of discount ${formatCurrency(totalDiscount / 100)}`}
            highlight
          />
          <KpiCard
            label="Panier moyen"
            value={formatCurrency(avgOrderValue / 100)}
            sub={aovDelta !== null
              ? `${aovDelta > 0 ? '↑' : '↓'} ${Math.abs(aovDelta)}% vs moyenne globale ${formatCurrency(globalAov / 100)}`
              : '—'}
            accent={aovDelta !== null && aovDelta > 0 ? 'success' : aovDelta !== null && aovDelta < 0 ? 'warn' : undefined}
          />
          <KpiCard
            label="Clients uniques"
            value={String(usersByRevenue.size)}
            sub={`${usageCount > 0 ? (usageCount / Math.max(1, usersByRevenue.size)).toFixed(1) : '0'} orders/client en moy.`}
          />
        </section>

        {/* ─── Timeline ─────────────────────────────────────────── */}
        {timeline.length > 0 && (
          <section style={{
            marginBottom: 32,
            padding: 24,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
          }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, margin: '0 0 16px' }}>
              Utilisations · 30 derniers jours
            </h2>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, marginBottom: 8 }}>
              {timeline.map(([day, n]) => (
                <div
                  key={day}
                  title={`${day} : ${n} utilisation${n > 1 ? 's' : ''}`}
                  style={{
                    flex: 1,
                    height: `${(n / maxDaily) * 100}%`,
                    minHeight: 4,
                    background: 'var(--accent-primary)',
                    borderRadius: '2px 2px 0 0',
                    transition: 'opacity 0.15s',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <span>{timeline[0]?.[0]}</span>
              <span>{timeline[timeline.length - 1]?.[0]}</span>
            </div>
          </section>
        )}

        {/* ─── Top users ─────────────────────────────────────────── */}
        {topUsers.length > 0 && (
          <section style={{
            marginBottom: 32,
            padding: 24,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
          }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, margin: '0 0 16px' }}>
              Top {topUsers.length} clients
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px 4px', fontWeight: 600 }}>Client</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Orders</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Revenu</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u) => (
                  <tr key={u.userId} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 4px' }}>
                      <Link href={`/admin/users/${u.userId}` as Route} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}>
                        {u.name}
                      </Link>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {u.email}
                      </div>
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {u.count}
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {formatCurrency(u.revenueCents / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ─── Recent orders ──────────────────────────────────── */}
        <section style={{
          padding: 24,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--r-xl)',
        }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, margin: '0 0 16px' }}>
            10 dernières orders avec ce code
          </h2>
          {usedOrders.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              Aucune order n&apos;a utilisé ce code pour l&apos;instant.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px 4px', fontWeight: 600 }}>Order</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600 }}>Client</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Discount</th>
                </tr>
              </thead>
              <tbody>
                {usedOrders.slice(0, 10).map((o) => (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 4px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      <Link href={`/admin/orders/${o.id}` as Route} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                        #{o.sinaliteOrderId ?? o.id.slice(-6).toUpperCase()}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 4px', color: 'var(--text-secondary)' }}>
                      {o.user?.email ?? '—'}
                    </td>
                    <td style={{ padding: '10px 4px', color: 'var(--text-muted)' }}>
                      {formatDate(o.createdAt.toISOString())}
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(o.amountCents / 100)}
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                      -{formatCurrency(o.discountCents / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}

function KpiCard({
  label, value, sub, highlight, accent,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  accent?: 'success' | 'warn';
}) {
  const valueColor = accent === 'success' ? 'var(--success, #16A34A)'
    : accent === 'warn' ? 'var(--warning, #D97706)'
    : highlight ? 'var(--accent-primary)'
    : 'var(--text-primary)';
  return (
    <div style={{
      padding: 20,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--r-lg)',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        fontWeight: 600,
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 28,
        letterSpacing: '-0.02em',
        color: valueColor,
        fontWeight: 400,
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
