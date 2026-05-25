/**
 * /orders — Server Component qui consomme la DB locale (Prisma).
 *
 * Avant on hit Sinalite à chaque visite, mais ça ne marche qu'avec le compte
 * wholesale globale — pas par utilisateur. Maintenant on lit notre DB qui
 * contient un snapshot par order (créé par le webhook Stripe).
 *
 * Auth.js n'étant pas encore branché, on liste TOUTES les commandes pour le
 * MVP. À filtrer par session.user.id quand l'auth sera en place.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import OrderRow, { type OrderRowProps } from '@/components/account/OrderRow';
import { parseItemsSnapshot, shortItemSummary } from '@/lib/orders/items';
import ViewAsBanner from '@/components/admin/ViewAsBanner';
import { formatCurrency } from '@/lib/format';
import { listOrdersForUser, type OrderStatus } from '@/lib/db/orders';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { recordAdminAudit } from '@/lib/db/admin-audit';

export const metadata = { title: 'Mes commandes — Plio' };

export const dynamic = 'force-dynamic';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAsUserId?: string }>;
}) {
  const session = await auth();
  // Middleware déjà rejette si non authentifié, mais on garde un fallback
  // pour les Server Components qui pourraient être rendus différemment.
  if (!session?.user) redirect('/sign-in?callbackUrl=/orders' as Route);

  // ─── Admin "view as user" — read-only impersonation ───────────────────
  // Feature support : un admin peut voir cette page comme un user
  // spécifique en passant `?viewAsUserId=...`. Strictement read-only :
  // les actions write (cancel, refund, etc.) ne sont JAMAIS exécutées
  // sous l'identité du target user — elles passent toujours par
  // /api/admin/* qui utilise session.user.id (l'admin).
  //
  // Gating :
  //   - Requiert session.user.role === 'ADMIN' (vérifié par auth.config
  //     middleware déjà, mais on re-check ici par défense en profondeur).
  //   - Si non-admin passe le param → silently ignoré (pas d'erreur pour
  //     ne pas leak l'existence d'un userId).
  //
  // Audit : chaque view-as logue un AdminAuditEvent kind=ADMIN_VIEW_AS_USER
  // avec adminId + targetId pour traçabilité interne.
  const { viewAsUserId } = await searchParams;
  const wantsImpersonate = !!viewAsUserId && viewAsUserId !== session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  const isImpersonating = wantsImpersonate && isAdmin;
  const targetUserId = isImpersonating ? viewAsUserId! : session.user.id;

  const impersonatedUser = isImpersonating
    ? await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { email: true, name: true, firstName: true },
      })
    : null;

  // Si l'admin demande un userId qui n'existe pas, on bascule sur ses
  // propres données plutôt que de planter — UX dégradée mais pas cassée.
  const effectiveUserId = impersonatedUser ? targetUserId : session.user.id;

  if (isImpersonating && impersonatedUser) {
    // Fire-and-forget — le helper ne throw jamais. On n'attend pas pour
    // garder la page rapide.
    void recordAdminAudit({
      kind: 'ADMIN_VIEW_AS_USER',
      adminId: session.user.id,
      adminEmail: session.user.email ?? '',
      targetType: 'USER',
      targetId: targetUserId,
      data: { page: '/orders' },
    });
  }

  const dbOrders = await listOrdersForUser({ userId: effectiveUserId, limit: 50 });

  const orders: OrderRowProps[] = dbOrders.map((o) => {
    const items = parseItemsSnapshot(o.itemsSnapshot);
    return {
      id: o.id,
      // Customer-facing display : juste le numéro (la presse est un détail d'implémentation,
      // pas la marque). En admin on garde #SIN-X pour distinguer Sinalite ID vs Plio ID.
      displayId: o.sinaliteOrderId ? `#${o.sinaliteOrderId}` : `#${o.id.slice(-6).toUpperCase()}`,
      status: o.status as OrderStatus,
      createdAt: o.createdAt,
      amountCents: o.amountCents,
      shippingMethod: o.shippingMethod,
      taxCents: o.taxCents,
      shipName: o.shipName,
      shipCity: o.shipCity,
      shipProvince: o.shipProvince,
      itemSummaries: items?.map(shortItemSummary),
    };
  });

  const totalSpent = orders.reduce((sum, o) => sum + o.amountCents / 100, 0);
  const counts = bucketStatus(orders);

  return (
    <div className="acct-shell">
      {impersonatedUser && (
        <ViewAsBanner targetUser={impersonatedUser} exitHref="/orders" />
      )}
      <Sidebar active="/orders" />

      {/* Round 40 #2 — padding via .acct-main CSS so mobile @media (max-width:900px) wins */}
      <main className="acct-main" style={{ maxWidth: 1280 }}>
        <div className="page-header" style={pageHeader}>
          <div>
            <h1 className="page-title" style={pageTitle}>Mes commandes</h1>
            <p className="page-subtitle" style={pageSubtitle}>
              {orders.length === 0 ? (
                <>Aucune commande pour le moment.</>
              ) : (
                <>
                  <strong style={{ color: 'var(--text-primary)' }}>{counts.live}</strong>{' '}
                  en cours ·{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{counts.done}</strong>{' '}
                  livrées · {formatCurrency(totalSpent)} depuis ton inscription
                </>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Round 28 #2 — CSV self-serve export (audit comptable perso) */}
            {orders.length > 0 && (
              <a
                href="/api/account/orders/export"
                download
                title="Télécharger toutes tes commandes en CSV (Excel-friendly, audit comptable perso)"
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-pill)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textDecoration: 'none',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                ⬇ CSV
              </a>
            )}
            <Link href={'/order/start' as Route} className="page-action" style={pageAction}>
              + Nouvelle commande
            </Link>
          </div>
        </div>

        {orders.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <Toolbar counts={counts} />
            <div className="order-list" style={{ display: 'grid', gap: 12 }}>
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function bucketStatus(orders: OrderRowProps[]) {
  const counts = {
    total: orders.length,
    live: 0,
    done: 0,
    SHIPPED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };
  for (const o of orders) {
    if (o.status === 'PAID' || o.status === 'SUBMITTED' || o.status === 'IN_PRODUCTION') {
      counts.live++;
    }
    if (o.status === 'SHIPPED') counts.SHIPPED++;
    if (o.status === 'DELIVERED') counts.DELIVERED++;
    if (o.status === 'CANCELLED' || o.status === 'FAILED') counts.CANCELLED++;
    if (o.status === 'DELIVERED' || o.status === 'SHIPPED') counts.done++;
  }
  return counts;
}

function Toolbar({ counts }: { counts: ReturnType<typeof bucketStatus> }) {
  const pills = [
    { label: 'Tous', n: counts.total, active: true },
    { label: 'En production', n: counts.live },
    { label: 'Expédiées', n: counts.SHIPPED },
    { label: 'Livrées', n: counts.DELIVERED },
    { label: 'Annulées', n: counts.CANCELLED },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 0',
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: 24,
        flexWrap: 'wrap',
      }}
    >
      <div style={pillsWrap}>
        {pills.map((p) => (
          <div key={p.label} className={`filter-pill ${p.active ? 'active' : ''}`} style={pillStyle(p.active)}>
            <span>{p.label}</span>
            <span style={numStyle(p.active)}>{p.n}</span>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
        📅 50 dernières commandes
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        gap: 16,
        padding: '96px 24px',
        background: 'var(--bg-surface)',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--r-xl)',
        textAlign: 'center',
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <div style={{ fontSize: 48 }}>📦</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.01em', fontWeight: 400, margin: 0 }}>
        Aucune commande pour le moment.
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 320 }}>
        Quand tu passeras ta première commande, elle apparaîtra ici avec son suivi en direct.
      </p>
      <Link href={'/order/start' as Route} className="btn btn-primary" style={{ marginTop: 8 }}>
        Démarrer ma première commande →
      </Link>
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────

const pageHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 24,
  marginBottom: 8,
  flexWrap: 'wrap',
};

const pageTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(40px, 5vw, 64px)',
  letterSpacing: '-0.025em',
  margin: 0,
  fontWeight: 400,
};

const pageSubtitle: React.CSSProperties = {
  fontSize: 16,
  color: 'var(--text-muted)',
  margin: '0 0 32px',
};

const pageAction: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 20px',
  height: 44,
  borderRadius: 'var(--r-pill)',
  background: 'var(--accent-primary)',
  color: 'var(--text-on-accent)',
  fontSize: 15,
  fontWeight: 500,
  boxShadow: 'var(--shadow-sm)',
  textDecoration: 'none',
};

const pillsWrap: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  background: 'var(--bg-sunken)',
  padding: 3,
  borderRadius: 'var(--r-pill)',
};

function pillStyle(active?: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: 'var(--r-pill)',
    fontSize: 13,
    fontWeight: 500,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    background: active ? 'var(--bg-surface)' : 'transparent',
    boxShadow: active ? 'var(--shadow-xs)' : 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  };
}

function numStyle(active?: boolean): React.CSSProperties {
  return {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
    fontWeight: active ? 700 : 500,
  };
}
