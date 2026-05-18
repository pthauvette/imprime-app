/**
 * /admin/users/[id] — Profil utilisateur complet.
 *
 * Server Component — query user + orders + addresses + designDrafts +
 * accounts + sessions en parallèle. Si user introuvable → notFound().
 */

import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import type { OrderStatus, OrderEventKind } from '@/lib/db/orders';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  PAID: 'Payée',
  SUBMITTED: 'Soumise',
  IN_PRODUCTION: 'Production',
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

const EVENT_DOT: Record<OrderEventKind, string> = {
  PAYMENT_SUCCEEDED: 'commerce',
  PAYMENT_FAILED: 'commerce',
  SINALITE_SUBMITTED: 'commerce',
  SINALITE_STATUS_CHANGED: 'commerce',
  REFUND_ISSUED: 'commerce',
  ERROR: 'security',
};

const EVENT_LABEL: Record<OrderEventKind, string> = {
  PAYMENT_SUCCEEDED: 'Paiement réussi',
  PAYMENT_FAILED: 'Paiement échoué',
  SINALITE_SUBMITTED: 'Soumis à Sinalite',
  SINALITE_STATUS_CHANGED: 'Statut Sinalite mis à jour',
  REFUND_ISSUED: 'Refund émis',
  ERROR: 'Erreur de traitement',
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { email: true, name: true } });
  return { title: `Admin — ${user?.name ?? user?.email ?? 'Utilisateur'}` };
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const [
    user,
    sidebarOrders,
    sidebarUsers,
    sidebarWebhooks,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' } },
        addresses: { orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] },
        accounts: true,
        sessions: { orderBy: { expires: 'desc' }, take: 5 },
        designDrafts: { take: 1 },
        savedConfigs: { orderBy: { createdAt: 'desc' }, take: 10 },
        referralsEarned: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { referee: { select: { email: true } } },
        },
      },
    }),
    prisma.order.count(),
    prisma.user.count(),
    prisma.webhookEvent.count(),
  ]);

  if (!user) notFound();

  // Reseller application status pour cet email (si existe).
  // Best-effort : si la table n'est pas migrée encore, retourne null.
  const resellerApp = await prisma.resellerApplication.findFirst({
    where: { email: user.email.toLowerCase() },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null);

  // ─── Events timeline (most recent across user's orders) ────────────────
  const orderIds = user.orders.map((o) => o.id);
  const events = orderIds.length > 0
    ? await prisma.orderEvent.findMany({
        where: { orderId: { in: orderIds } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { order: { select: { id: true, sinaliteOrderId: true, amountCents: true } } },
      })
    : [];

  // ─── Aggregates ────────────────────────────────────────────────────────
  const orderCount = user.orders.length;
  const ltvCents = user.orders.reduce((a, o) => a + o.amountCents, 0);
  const aovCents = orderCount > 0 ? Math.round(ltvCents / orderCount) : 0;
  const lastOrder = user.orders[0];
  const failedCount = user.orders.filter((o) => o.status === 'FAILED').length;
  const refundCount = events.filter((e) => e.kind === 'REFUND_ISSUED').length;
  const lastSession = user.sessions[0];

  const riskTone: 'good' | 'warn' | 'bad' =
    failedCount + refundCount === 0 ? 'good'
    : failedCount + refundCount <= 2 ? 'warn'
    : 'bad';

  const displayName = user.name
    ?? [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    ?? user.email.split('@')[0];

  const initials = userInitials(displayName, user.email);

  const sidebarCounts = {
    orders: sidebarOrders,
    webhooks: sidebarWebhooks,
    templates: 3,
    products: 468,
    users: sidebarUsers,
  };

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="users"
        counts={sidebarCounts}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <nav className="ud-breadcrumb">
          <Link href={'/admin/users' as Route}>← Utilisateurs</Link>
          <span style={{ color: 'var(--border-strong)' }}>/</span>
          <span className="ud-breadcrumb-current">{displayName || user.email}</span>
        </nav>

        <header className="ud-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div className="ud-avatar-big">{initials}</div>
          <div style={{ flex: 1 }}>
            <h1 className="ud-name">{displayName || user.email}</h1>
            <div className="ud-name-meta">
              <strong>{user.email}</strong> · membre depuis le {formatDate(user.createdAt.toISOString())} · ID <span style={{ color: 'var(--text-muted)' }}>{user.id}</span>
            </div>
            <div className="ud-header-tags">
              {user.emailVerified ? (
                <span className="ud-tag verified">✓ Email vérifié</span>
              ) : (
                <span className="ud-tag" style={{ background: 'var(--bg-sunken)', color: 'var(--text-muted)' }}>Guest</span>
              )}
              {ltvCents >= 100_000 && (
                <span className="ud-tag vip">High-value · LTV {formatCurrency(ltvCents / 100)}</span>
              )}
              {user.role === 'ADMIN' && (
                <span className="ud-tag vip">Admin</span>
              )}
            </div>
          </div>
          {/* View-as : ouvre /orders en mode admin pour voir la même chose
              que le user. Read-only, audit log automatique côté target page. */}
          {user.id !== session?.user?.id && (
            <Link
              href={`/orders?viewAsUserId=${user.id}` as Route}
              title="Voir les commandes comme ce client (mode admin, read-only)"
              style={{
                fontSize: 12,
                padding: '8px 14px',
                background: 'var(--bg-sunken)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--r-sm)',
                textDecoration: 'none',
                fontWeight: 600,
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                border: '1px solid var(--border-subtle)',
              }}
            >
              👁 Voir comme ce client
            </Link>
          )}
        </header>

        {/* ─── Quick stats ──────────────────────────────────────── */}
        <section className="ud-quickstats">
          <div className="ud-qs">
            <div className="ud-qs-label">Lifetime value</div>
            <div className="ud-qs-value accent">
              {formatCurrency(ltvCents / 100)}<span className="unit">CAD</span>
            </div>
            <div className="ud-qs-meta">
              {refundCount > 0 ? `${refundCount} refund${refundCount > 1 ? 's' : ''} émis` : 'net · 0 refund'}
            </div>
          </div>
          <div className="ud-qs">
            <div className="ud-qs-label">Commandes</div>
            <div className="ud-qs-value">{orderCount}<span className="unit">total</span></div>
            <div className="ud-qs-meta">
              {orderCount > 0
                ? `${user.orders.filter((o) => o.status === 'DELIVERED').length} livrée${user.orders.filter((o) => o.status === 'DELIVERED').length > 1 ? 's' : ''}`
                : 'aucune commande'}
            </div>
          </div>
          <div className="ud-qs">
            <div className="ud-qs-label">Panier moyen (AOV)</div>
            <div className="ud-qs-value">
              {aovCents > 0 ? formatCurrency(aovCents / 100) : '—'}
              <span className="unit">CAD</span>
            </div>
            <div className="ud-qs-meta">{orderCount > 0 ? `sur ${orderCount} commandes` : '—'}</div>
          </div>
          <div className="ud-qs">
            <div className="ud-qs-label">Dernière commande</div>
            <div className="ud-qs-value">
              {lastOrder ? formatDate(lastOrder.createdAt.toISOString()) : '—'}
              <span className="unit"></span>
            </div>
            <div className="ud-qs-meta">
              {lastOrder
                ? (lastOrder.sinaliteOrderId ? `#SIN-${lastOrder.sinaliteOrderId}` : `#${lastOrder.id.slice(-6).toUpperCase()}`)
                : '—'}
            </div>
          </div>
        </section>

        {/* ─── 2-col grid ───────────────────────────────────────── */}
        <div className="ud-grid">

          {/* ─── LEFT ───────────────────────────────────────────── */}
          <div className="ud-col-left">

            {/* Orders history */}
            <div className="ud-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">
                  Historique de commandes
                  <span className="ud-panel-title-meta">{orderCount} commande{orderCount > 1 ? 's' : ''}</span>
                </h2>
              </div>
              {orderCount === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucune commande pour ce client.
                </div>
              ) : (
                <table className="ud-orders-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.orders.slice(0, 25).map((o) => {
                      const status = o.status as OrderStatus;
                      const displayId = o.sinaliteOrderId
                        ? `#SIN-${o.sinaliteOrderId}`
                        : `#${o.id.slice(-6).toUpperCase()}`;
                      return (
                        <tr key={o.id}>
                          <td>
                            <Link href={`/admin/orders/${o.id}` as Route} className="ud-order-id">
                              {displayId}
                            </Link>
                          </td>
                          <td className="ud-order-date">{formatDate(o.createdAt.toISOString())}</td>
                          <td className="ud-order-total" style={{ textAlign: 'right' }}>{o.itemsCount}</td>
                          <td className="ud-order-total" style={{ textAlign: 'right' }}>{formatCurrency(o.amountCents / 100)}</td>
                          <td>
                            <span className={`ud-order-status ${STATUS_CLASS[status]}`}>
                              {STATUS_LABELS[status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Activity timeline */}
            <div className="ud-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">
                  Activité
                  <span className="ud-panel-title-meta">events récents</span>
                </h2>
              </div>
              {events.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucune activité encore.
                </div>
              ) : (
                <div className="ud-activity">
                  {events.map((e) => {
                    const kind = e.kind as OrderEventKind;
                    const ref = e.order.sinaliteOrderId
                      ? `#SIN-${e.order.sinaliteOrderId}`
                      : `#${e.order.id.slice(-6).toUpperCase()}`;
                    return (
                      <div key={e.id} className="ud-act">
                        <div className={`ud-act-dot ${EVENT_DOT[kind]}`}>{eventIcon(kind)}</div>
                        <div className="ud-act-text">
                          {EVENT_LABEL[kind]}
                          {kind === 'PAYMENT_SUCCEEDED' && <> · <strong>{formatCurrency(e.order.amountCents / 100)}</strong></>}
                          {' · '}<Link href={`/admin/orders/${e.order.id}` as Route} className="ref">{ref}</Link>
                        </div>
                        <span className="ud-act-time">{formatDate(e.createdAt.toISOString())}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Programme de parrainage */}
            <div className="ud-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">
                  Parrainage
                  <span className="ud-panel-title-meta">
                    {user.referralCode ? `code ${user.referralCode}` : 'pas encore généré'}
                  </span>
                </h2>
              </div>
              <div style={{ padding: 22, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <Mini label="Crédit disponible" value={`${formatCurrency((user.referralCreditCents ?? 0) / 100)}`} highlight={(user.referralCreditCents ?? 0) > 0} />
                <Mini label="Parrainages réussis" value={String(user.referralsEarned?.filter((r) => r.status === 'CREDITED').length ?? 0)} />
                <Mini label="Parrainé par" value={user.referredByCode ?? '—'} mono />
              </div>
              {user.referralsEarned && user.referralsEarned.length > 0 && (
                <div style={{ padding: '0 22px 22px', borderTop: '1px solid var(--border-subtle)' }}>
                  <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '14px 0 10px' }}>
                    Filleuls
                  </h3>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {user.referralsEarned.slice(0, 5).map((r) => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {r.referee.email} · {formatDate(r.createdAt.toISOString())}
                        </span>
                        <span style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 10,
                          background: r.status === 'CREDITED' ? 'var(--success-soft, #f0fdf4)' : 'var(--bg-sunken)',
                          color: r.status === 'CREDITED' ? 'var(--success, #16a34a)' : 'var(--text-muted)',
                          fontWeight: 700,
                        }}>
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Configurations sauvées */}
            {user.savedConfigs && user.savedConfigs.length > 0 && (
              <div className="ud-panel">
                <div className="ud-panel-head">
                  <h2 className="ud-panel-title">
                    Configurations sauvées
                    <span className="ud-panel-title-meta">{user.savedConfigs.length} configuration{user.savedConfigs.length > 1 ? 's' : ''}</span>
                  </h2>
                </div>
                <div style={{ padding: '0 22px 22px' }}>
                  {user.savedConfigs.slice(0, 5).map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '12px 0',
                        borderTop: '1px solid var(--border-subtle)',
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                          {c.summary}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                          {c.timesUsed} usage{c.timesUsed > 1 ? 's' : ''}
                        </div>
                        {c.lastUsedAt && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            dernier {formatDate(c.lastUsedAt.toISOString())}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Application reseller (si existe) */}
            {resellerApp && (
              <div className="ud-panel">
                <div className="ud-panel-head">
                  <h2 className="ud-panel-title">
                    Programme reseller
                    <span className="ud-panel-title-meta">{resellerApp.companyName}</span>
                  </h2>
                </div>
                <div style={{ padding: 22 }}>
                  <div style={{ marginBottom: 12 }}>
                    <span
                      style={{
                        padding: '4px 12px',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        borderRadius: 4,
                        background:
                          resellerApp.status === 'APPROVED' ? 'var(--success-soft, #f0fdf4)' :
                          resellerApp.status === 'PENDING' ? 'var(--warning-soft, #FFF6E5)' :
                          resellerApp.status === 'REJECTED' ? 'var(--danger-soft)' : 'var(--bg-sunken)',
                        color:
                          resellerApp.status === 'APPROVED' ? 'var(--success, #16a34a)' :
                          resellerApp.status === 'PENDING' ? 'var(--warning, #D97706)' :
                          resellerApp.status === 'REJECTED' ? 'var(--danger)' : 'var(--text-muted)',
                      }}
                    >
                      {resellerApp.status}
                    </span>
                    <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      depuis {formatDate(resellerApp.createdAt.toISOString())}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    {resellerApp.estimatedMonthlyCents !== null && (
                      <Mini label="Volume estimé" value={`${formatCurrency(resellerApp.estimatedMonthlyCents / 100)} / mois`} />
                    )}
                    {resellerApp.website && (
                      <Mini label="Site" value={resellerApp.website.replace(/^https?:\/\//, '').replace(/\/$/, '')} />
                    )}
                  </div>
                  <Link href={'/admin/reseller-applications' as Route} style={{ fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
                    Gérer dans /admin/reseller-applications →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* ─── RIGHT ──────────────────────────────────────────── */}
          <aside className="ud-col-right">

            {/* Profile */}
            <div className="ud-card">
              <div className="ud-card-head">
                <div className="ud-card-label">Profil</div>
              </div>
              <div className="ud-field-row">
                <div className="ud-field-mini">
                  <span className="label">Nom</span>
                  <span className="value">{user.name ?? formatNameFallback(user) ?? '—'}</span>
                </div>
                <div className="ud-field-mini">
                  <span className="label">Email</span>
                  <span className="value">{user.email}</span>
                </div>
                <div className="ud-field-mini">
                  <span className="label">Prénom</span>
                  <span className="value">{user.firstName ?? '—'}</span>
                </div>
                <div className="ud-field-mini">
                  <span className="label">Nom</span>
                  <span className="value">{user.lastName ?? '—'}</span>
                </div>
                <div className="ud-field-mini">
                  <span className="label">Téléphone</span>
                  <span className="value">{user.phone ?? '—'}</span>
                </div>
                <div className="ud-field-mini">
                  <span className="label">Rôle</span>
                  <span className="value">{user.role}</span>
                </div>
              </div>
            </div>

            {/* Addresses */}
            <div className="ud-card">
              <div className="ud-card-head">
                <div className="ud-card-label">Carnet d'adresses</div>
              </div>
              {user.addresses.length === 0 ? (
                <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                  Aucune adresse sauvegardée.
                </div>
              ) : user.addresses.map((a) => (
                <div key={a.id} className="ud-addr">
                  <span className={`ud-addr-label${a.isDefault ? ' default' : ''}`}>
                    {a.kind === 'SHIPPING' ? 'Livraison' : 'Facturation'}
                  </span>
                  <div>
                    <span className="ud-addr-name">{a.firstName} {a.lastName}</span>
                    {a.isDefault && <span className="ud-addr-default-tag">Défaut</span>}
                  </div>
                  {a.company && <div>{a.company}</div>}
                  <div>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</div>
                  <div>{a.city}, {a.province}  {a.postalCode} · Canada</div>
                </div>
              ))}
            </div>

            {/* Auth providers */}
            <div className="ud-card">
              <div className="ud-card-label" style={{ marginBottom: 6 }}>Authentification</div>
              <div className="ud-kv-row">
                <span className="label">Email</span>
                <span className={`value${user.emailVerified ? ' good' : ''}`}>
                  {user.emailVerified ? '✓ Vérifié' : 'Non vérifié'}
                </span>
              </div>
              <div className="ud-kv-row">
                <span className="label">Providers</span>
                <span className="value">
                  {user.accounts.length === 0 ? '—' : user.accounts.map((a) => a.provider).join(', ')}
                </span>
              </div>
              <div className="ud-kv-row">
                <span className="label">Sessions actives</span>
                <span className="value">{user.sessions.length}</span>
              </div>
              <div className="ud-kv-row">
                <span className="label">Dernière session</span>
                <span className="value">
                  {lastSession ? formatDateTime(lastSession.expires.toISOString()) : '—'}
                </span>
              </div>
              <div className="ud-kv-row">
                <span className="label">Compte créé</span>
                <span className="value">{formatDate(user.createdAt.toISOString())}</span>
              </div>
            </div>

            {/* Risk */}
            <div className="ud-card">
              <div className="ud-card-head">
                <div className="ud-card-label">Risque</div>
              </div>
              <div className="ud-risk-score">
                <div className="ud-risk-ring">
                  <svg viewBox="0 0 56 56">
                    <circle cx={28} cy={28} r={24} fill="none" stroke="var(--bg-sunken)" strokeWidth={5} />
                    <circle
                      cx={28}
                      cy={28}
                      r={24}
                      fill="none"
                      stroke={riskTone === 'good' ? 'var(--success)' : riskTone === 'warn' ? 'var(--warning)' : 'var(--danger)'}
                      strokeWidth={5}
                      strokeDasharray={150.8}
                      strokeDashoffset={Math.max(0, 150.8 - (Math.min(failedCount + refundCount, 10) / 10) * 150.8)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="ud-risk-ring-val">{failedCount + refundCount}</span>
                </div>
                <div>
                  <div className="ud-risk-label">Signal de risque</div>
                  <div className={`ud-risk-text ud-risk-${riskTone === 'good' ? 'good' : riskTone === 'warn' ? 'warn' : 'bad'}`}>
                    {riskTone === 'good' ? 'Profil propre' : riskTone === 'warn' ? 'À surveiller' : 'Profil risqué'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
                    {failedCount} échec · {refundCount} refund
                  </div>
                </div>
              </div>
              <div className="ud-kv-row">
                <span className="label">Commandes échec</span>
                <span className={`value${failedCount === 0 ? ' good' : ''}`}>{failedCount}</span>
              </div>
              <div className="ud-kv-row">
                <span className="label">Refunds</span>
                <span className={`value${refundCount === 0 ? ' good' : ''}`}>{refundCount}</span>
              </div>
            </div>

            {/* Danger zone (placeholders) */}
            <div className="ud-danger">
              <div className="ud-danger-label">Zone dangereuse</div>
              <button className="ud-danger-btn" disabled title="Pas encore branché">
                <span>Forcer la déconnexion · toutes les sessions</span>
                <span className="arrow">→</span>
              </button>
              <button className="ud-danger-btn" disabled title="Pas encore branché">
                <span>Supprimer le compte · GDPR</span>
                <span className="arrow">→</span>
              </button>
            </div>

          </aside>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function Mini({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: highlight ? 'var(--accent-primary)' : 'var(--text-primary)',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function userInitials(displayName: string, email: string): string {
  if (displayName && !displayName.includes('@')) {
    const parts = displayName.trim().split(/\s+/).slice(0, 2);
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

function eventIcon(k: OrderEventKind): string {
  return {
    PAYMENT_SUCCEEDED: '$',
    PAYMENT_FAILED: '✕',
    SINALITE_SUBMITTED: '→',
    SINALITE_STATUS_CHANGED: '↗',
    REFUND_ISSUED: '↩',
    ERROR: '!',
  }[k] ?? '·';
}
