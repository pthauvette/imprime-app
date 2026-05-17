/**
 * /orders/[id] — Page customer pour suivre une commande.
 *
 * Server Component qui charge l'order depuis Prisma. Ownership check :
 * le user doit posséder l'order OU être ADMIN. Sinon 404 silencieux (pas
 * de fuite d'info sur l'existence d'autres orders).
 *
 * Layout : 2 colonnes (timeline + items à gauche, sticky tracking + actions
 * à droite). Réutilise les classes `.live-*` `.tracking-*` `.item-*` migrées
 * depuis order-detail.html dans migrated-pages.css.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Route } from 'next';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import Sidebar from '@/components/account/Sidebar';
import ViewAsBanner from '@/components/admin/ViewAsBanner';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import type { OrderEventKind, OrderStatus } from '@/lib/db/orders';
import { formatCurrency, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Commande ${id.slice(-6).toUpperCase()} — Plio` };
}

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
  PENDING: 'status-new',
  PAID: 'status-new',
  SUBMITTED: 'status-new',
  IN_PRODUCTION: 'status-production',
  SHIPPED: 'status-shipped',
  DELIVERED: 'status-delivered',
  CANCELLED: 'status-cancelled',
  FAILED: 'status-cancelled',
};

export default async function CustomerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/orders/${id}` as Route);
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true, firstName: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!order) notFound();

  const isOwner = order.userId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  if (!isOwner && !isAdmin) notFound();

  // Admin viewing another user's order → audit log + banner. Pas besoin
  // de query param ici parce que l'URL identifie déjà l'order spécifique.
  const isImpersonating = isAdmin && !isOwner;
  if (isImpersonating) {
    void recordAdminAudit({
      kind: 'ADMIN_VIEW_AS_USER',
      adminId: session.user.id,
      adminEmail: session.user.email ?? '',
      targetType: 'ORDER',
      targetId: order.id,
      data: { page: `/orders/${order.id}`, customerId: order.userId, customerEmail: order.user.email },
    });
  }

  const status = order.status as OrderStatus;
  // Customer-facing display : juste le numéro (sans le prefix SIN- qui révèle
  // l'identité de la presse partenaire). Admin garde #SIN-X dans /admin/orders.
  const displayId = order.sinaliteOrderId ? `#${order.sinaliteOrderId}` : `#${order.id.slice(-6).toUpperCase()}`;

  const shippedEvent = [...order.events].reverse().find(
    (e) => e.kind === 'SINALITE_STATUS_CHANGED' && e.data?.includes('SHIPPED'),
  );
  const tracking = shippedEvent ? extractTracking(shippedEvent.data) : null;
  const eta = computeEta(order, shippedEvent?.createdAt);

  const timeline = buildTimeline(order, status);

  return (
    <div className="acct-shell">
      {isImpersonating && (
        <ViewAsBanner
          targetUser={order.user}
          exitHref={`/admin/orders/${order.id}`}
        />
      )}
      <Sidebar active="/orders" />

      <main className="detail-main" style={{ padding: '40px 48px 80px', maxWidth: 1280 }}>
        <Link
          href={'/orders' as Route}
          className="back-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 600,
            textDecoration: 'none',
            marginBottom: 24,
          }}
        >
          ← Toutes mes commandes
        </Link>

        <div
          className="order-header-card"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 32,
            padding: 32,
            background: 'var(--bg-surface)',
            borderRadius: 'var(--r-xl)',
            border: '1px solid var(--border-subtle)',
            marginBottom: 32,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="header-info">
            <div className="order-id-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <span className="order-id-big" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.04em', fontWeight: 600 }}>
                {displayId}
              </span>
              <span className={`order-status-big ${STATUS_CLASS[status]}`}>
                {STATUS_LABELS[status]}
              </span>
              {order.paidAt && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>
                  ✓ Payée le {formatDate(order.paidAt.toISOString())}
                </span>
              )}
            </div>
            <h1
              className="header-product-name"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(36px, 4vw, 56px)',
                letterSpacing: '-0.025em',
                margin: '4px 0 8px',
                fontWeight: 400,
                lineHeight: 1.05,
              }}
            >
              {order.itemsCount} article{order.itemsCount > 1 ? 's' : ''}{' '}
              <em style={{ color: 'var(--accent-primary)' }}>
                imprimé{order.itemsCount > 1 ? 's' : ''}.
              </em>
            </h1>
            <div className="header-product-meta" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              Vers <strong style={{ color: 'var(--text-primary)' }}>{order.shipName}</strong> à{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{order.shipCity}, {order.shipProvince}</strong>{' '}
              · {order.shippingMethod}
            </div>
          </div>

          {eta && (
            <div
              style={{
                textAlign: 'right',
                padding: '16px 24px',
                background: 'var(--accent-soft)',
                borderRadius: 'var(--r-lg)',
                minWidth: 200,
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-primary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                {status === 'DELIVERED' ? 'Livrée le' : 'Arrivée prévue'}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--accent-primary)', letterSpacing: '-0.02em', fontWeight: 400, lineHeight: 1.15, marginTop: 4 }}>
                {eta.day}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {eta.relative}
              </div>
            </div>
          )}
        </div>

        <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24, alignItems: 'start' }}>

          <div style={{ display: 'grid', gap: 24 }}>

            <section className="panel" style={{ padding: 24, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-xl)' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '-0.01em', margin: '0 0 20px', fontWeight: 400 }}>
                Suivi en direct
              </h2>
              <div className="live-timeline" style={{ display: 'grid', gap: 18 }}>
                {timeline.map((step, i) => (
                  <div
                    key={step.label}
                    className="live-step"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 1fr auto',
                      alignItems: 'flex-start',
                      gap: 16,
                      opacity: step.done || step.current ? 1 : 0.4,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: step.done ? 'var(--accent-primary)' : step.current ? 'var(--bg-surface)' : 'var(--bg-sunken)',
                        border: step.current ? '2px solid var(--accent-primary)' : '1px solid var(--border-default)',
                        color: step.done ? 'var(--text-on-accent)' : 'var(--accent-primary)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {step.done ? '✓' : i + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                        {step.label}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {step.description}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                      {step.timestamp ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={{ padding: 24, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-xl)' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '-0.01em', margin: '0 0 20px', fontWeight: 400 }}>
                Détails de la commande
              </h2>
              <div className="item-row" style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="item-thumb" style={{ width: 72, height: 48, background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)' }} />
                <div className="item-info">
                  <div className="item-name" style={{ fontWeight: 600, fontSize: 14 }}>Cartes de visite</div>
                  <div className="item-options" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Quantité · {order.itemsCount} · {order.shippingMethod}
                  </div>
                </div>
                <div className="item-price" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>
                  {formatCurrency(order.subtotalCents / 100)}
                </div>
              </div>

              <div className="total-breakdown" style={{ display: 'grid', gap: 6, marginTop: 16, fontSize: 13 }}>
                <Line label="Sous-total" value={formatCurrency(order.subtotalCents / 100)} />
                <Line label="Livraison" value={formatCurrency(order.shippingCents / 100)} />
                <Line label="Taxes" value={formatCurrency(order.taxCents / 100)} />
                <Line label="Total payé" value={`${formatCurrency(order.amountCents / 100)} ${order.currency}`} bold />
              </div>
            </section>
          </div>

          <aside style={{ position: 'sticky', top: 24, display: 'grid', gap: 16, alignSelf: 'start' }}>

            {tracking?.number ? (
              <div style={{ padding: 20, background: 'var(--accent-soft)', borderRadius: 'var(--r-lg)', border: '1px solid var(--accent-primary)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-primary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Numéro de suivi
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--text-primary)', marginTop: 8, fontWeight: 600, wordBreak: 'break-all' }}>
                  {tracking.number}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {tracking.carrier ?? 'Carrier'}
                </div>
                {tracking.url && (
                  <a
                    href={tracking.url}
                    target="_blank"
                    rel="noopener"
                    style={{
                      display: 'block',
                      marginTop: 14,
                      padding: '10px 14px',
                      background: 'var(--accent-primary)',
                      color: 'var(--text-on-accent)',
                      borderRadius: 'var(--r-md)',
                      textDecoration: 'none',
                      fontSize: 13,
                      fontWeight: 500,
                      textAlign: 'center',
                    }}
                  >
                    Suivre le colis →
                  </a>
                )}
              </div>
            ) : (
              <div style={{ padding: 20, background: 'var(--bg-sunken)', borderRadius: 'var(--r-lg)', border: '1px dashed var(--border-default)', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                {status === 'SHIPPED' || status === 'DELIVERED'
                  ? 'Numéro de suivi à venir.'
                  : 'Le tracking apparaîtra ici dès l\'expédition.'}
              </div>
            )}

            <Card label="Adresse de livraison">
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600 }}>{order.shipName}</div>
                <div>{order.shipLine1}</div>
                {order.shipLine2 && <div>{order.shipLine2}</div>}
                <div>{order.shipCity}, {order.shipProvince} {order.shipPostalCode}</div>
                <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{order.shipPhone}</div>
              </div>
            </Card>

            <Card label="Détails">
              <KV k="Commande" v={displayId} mono />
              <KV k="Date" v={formatDate(order.createdAt.toISOString())} />
              <KV k="Méthode" v={order.shippingMethod} />
              <KV k="Total" v={formatCurrency(order.amountCents / 100)} bold />
            </Card>

            <a
              href={`/api/orders/${order.id}/invoice.pdf`}
              download
              title="Reçu PDF officiel avec TPS/TVQ — pour ta comptabilité"
              style={{
                display: 'block',
                padding: '14px 18px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--r-md)',
                textAlign: 'center',
                fontSize: 14,
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              ⬇ Télécharger la facture PDF
            </a>

            <Link
              href={`/order/start?reorder=${order.id}` as Route}
              title="Repart avec les mêmes options · tu ré-uploads tes fichiers"
              style={{
                display: 'block',
                padding: '14px 18px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--r-md)',
                textAlign: 'center',
                fontSize: 14,
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              ↻ Recommander
            </Link>

            <div style={{ padding: 16, background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Une question ? On répond en moins de 4h ouvrables à{' '}
              <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>bonjour@plio.ca</a>.
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 18, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function KV({ k, v, mono, bold }: { k: string; v: string; mono?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontWeight: bold ? 600 : mono ? 500 : 400 }}>{v}</span>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: bold ? 15 : 13, fontWeight: bold ? 600 : 400, paddingTop: bold ? 12 : 4, borderTop: bold ? '1px solid var(--border-subtle)' : 'none', marginTop: bold ? 8 : 0 }}>
      <span style={{ color: bold ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

// ─── Timeline builder ─────────────────────────────────────────────────────

interface TimelineStep {
  label: string;
  description: string;
  done: boolean;
  current: boolean;
  timestamp: string | null;
}

function buildTimeline(
  order: { paidAt: Date | null; events: { kind: string; createdAt: Date; data: string | null }[]; createdAt: Date },
  status: OrderStatus,
): TimelineStep[] {
  const eventByKind = new Map<OrderEventKind, Date>();
  for (const e of order.events) {
    if (!eventByKind.has(e.kind as OrderEventKind)) eventByKind.set(e.kind as OrderEventKind, e.createdAt);
  }

  const sinaliteStatuses = order.events
    .filter((e) => e.kind === 'SINALITE_STATUS_CHANGED' && e.data)
    .map((e) => ({
      status: extractSinaliteStatus(e.data!),
      at: e.createdAt,
    }))
    .filter((x): x is { status: string; at: Date } => x.status !== null);

  const findSinalite = (s: string) => sinaliteStatuses.find((x) => x.status === s)?.at ?? null;

  const paymentAt = eventByKind.get('PAYMENT_SUCCEEDED') ?? order.paidAt;
  const submittedAt = eventByKind.get('SINALITE_SUBMITTED');
  const productionAt = findSinalite('IN_PRODUCTION');
  const shippedAt = findSinalite('SHIPPED');
  const deliveredAt = findSinalite('DELIVERED');

  return [
    {
      label: 'Paiement confirmé',
      description: paymentAt ? 'Carte chargée, début du workflow.' : 'En attente du paiement.',
      done: !!paymentAt,
      current: status === 'PAID' && !submittedAt,
      timestamp: paymentAt ? formatDateTime(paymentAt) : null,
    },
    {
      label: 'Envoi à la presse',
      description: 'Notre presse reçoit ta commande pour le prepress.',
      done: !!submittedAt || ['IN_PRODUCTION', 'SHIPPED', 'DELIVERED'].includes(status),
      current: status === 'SUBMITTED',
      timestamp: submittedAt ? formatDateTime(submittedAt) : null,
    },
    {
      label: 'En production',
      description: 'Tes fichiers sont imprimés et finis.',
      done: !!productionAt || ['SHIPPED', 'DELIVERED'].includes(status),
      current: status === 'IN_PRODUCTION',
      timestamp: productionAt ? formatDateTime(productionAt) : null,
    },
    {
      label: 'Expédiée',
      description: 'En route vers ton adresse.',
      done: !!shippedAt || status === 'DELIVERED',
      current: status === 'SHIPPED',
      timestamp: shippedAt ? formatDateTime(shippedAt) : null,
    },
    {
      label: 'Livrée',
      description: 'Reçue à destination.',
      done: status === 'DELIVERED',
      current: false,
      timestamp: deliveredAt ? formatDateTime(deliveredAt) : null,
    },
  ];
}

function extractSinaliteStatus(data: string): string | null {
  try {
    const parsed = JSON.parse(data) as { status?: string };
    return parsed.status ?? null;
  } catch {
    return null;
  }
}

function extractTracking(data: string | null): { number?: string; carrier?: string; url?: string } | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as { trackingNumber?: string; carrier?: string };
    if (!parsed.trackingNumber) return null;
    const carrier = parsed.carrier ?? 'UPS';
    const url = trackingDeepLink(carrier, parsed.trackingNumber);
    return { number: parsed.trackingNumber, carrier, url };
  } catch {
    return null;
  }
}

function trackingDeepLink(carrier: string, tracking: string): string | undefined {
  const c = carrier.toLowerCase();
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${encodeURIComponent(tracking)}`;
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`;
  if (c.includes('canada') || c.includes('post')) return `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encodeURIComponent(tracking)}`;
  return undefined;
}

function computeEta(
  order: { createdAt: Date; status: string },
  shippedAt?: Date,
): { day: string; relative: string } | null {
  if (order.status === 'CANCELLED' || order.status === 'FAILED') return null;
  if (order.status === 'DELIVERED' && shippedAt) {
    return { day: formatDateShort(shippedAt), relative: 'livrée' };
  }
  const base = shippedAt ?? order.createdAt;
  const daysAhead = shippedAt ? 3 : 7;
  const eta = new Date(base);
  eta.setDate(eta.getDate() + daysAhead);
  const today = new Date();
  const diffDays = Math.round((eta.getTime() - today.getTime()) / (24 * 3600 * 1000));
  const relative = diffDays <= 0 ? 'aujourd\'hui' : diffDays === 1 ? 'demain' : `dans ${diffDays} jours`;
  return { day: formatDateShort(eta), relative };
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'short' });
}

function formatDateTime(d: Date): string {
  return `${formatDate(d.toISOString())} · ${d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
