/**
 * /admin/orders/[id] — order detail Server Component.
 *
 * Charge l'order avec user + events depuis Prisma. Timeline render
 * chronologique de OrderEvent (créés par les webhooks Stripe + Sinalite +
 * les emails envoyés).
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Route } from 'next';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import OrderActions from '@/components/admin/OrderActions';
import AdminNotesPanel from '@/components/admin/AdminNotesPanel';
import SendCustomMessageButton from '@/components/admin/SendCustomMessageButton';
import type { OrderEventKind, OrderStatus } from '@/lib/db/orders';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { parseItemsSnapshot } from '@/lib/orders/items';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Admin — Commande ${id.slice(-6).toUpperCase()}` };
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente paiement',
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

const EVENT_LABEL: Record<OrderEventKind, { title: string; type: string; dot: string; icon: string }> = {
  PAYMENT_SUCCEEDED: { title: 'Paiement confirmé', type: 'PAYMENT_SUCCEEDED', dot: 'paid', icon: '$' },
  PAYMENT_FAILED: { title: 'Échec de paiement', type: 'PAYMENT_FAILED', dot: 'failed', icon: '✕' },
  SINALITE_SUBMITTED: { title: 'Commande soumise à Sinalite', type: 'SINALITE_SUBMITTED', dot: 'submitted', icon: '→' },
  SINALITE_STATUS_CHANGED: { title: 'Mise à jour Sinalite', type: 'SINALITE_STATUS_CHANGED', dot: 'production', icon: '⚙' },
  REFUND_ISSUED: { title: 'Remboursement émis', type: 'REFUND_ISSUED', dot: 'failed', icon: '↩' },
  ERROR: { title: 'Erreur enregistrée', type: 'ERROR', dot: 'failed', icon: '!' },
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: true,
      events: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!order) notFound();

  // Merge OrderEvent + AdminAuditEvent qui ciblent cette commande pour
  // une timeline complète (system events + admin actions humaines).
  const adminActions = await prisma.adminAuditEvent.findMany({
    where: { targetType: 'ORDER', targetId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const status = order.status as OrderStatus;
  const displayId = order.sinaliteOrderId ? `#SIN-${order.sinaliteOrderId}` : `#${order.id.slice(-6).toUpperCase()}`;

  const [ordersCount, usersCount] = await Promise.all([
    prisma.order.count(),
    prisma.user.count(),
  ]);

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="orders"
        counts={{ orders: ordersCount, users: usersCount, webhooks: 3, templates: 3, products: 468 }}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <div className="od-breadcrumb" style={{ marginBottom: 24 }}>
          <Link href={'/admin/orders' as Route} style={{ color: 'var(--text-muted)' }}>← Commandes</Link>
          <span className="od-breadcrumb-current" style={{ marginLeft: 8 }}>{displayId}</span>
        </div>

        <div className="od-header" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
          <div className="od-header-left">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
              <span className="od-id-big" style={{ fontFamily: 'var(--font-display)', fontSize: 48, letterSpacing: '-0.02em', fontWeight: 400 }}>
                {displayId}
              </span>
              <span className={`od-status-pill ord-status ${STATUS_CLASS[status]}`}>
                {STATUS_LABELS[status]}
              </span>
            </div>
            <div className="od-header-meta" style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 14 }}>
              Passée le {formatDate(order.createdAt.toISOString())} · {order.shipName} · {order.shipCity}, {order.shipProvince}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: '-0.02em', color: 'var(--accent-primary)' }}>
            {formatCurrency(order.amountCents / 100)}
          </div>
        </div>

        <div className="od-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>

          {/* ─── Left column ─── */}
          <div style={{ display: 'grid', gap: 24 }}>

            <section className="od-panel adm-panel">
              <div className="od-panel-head adm-panel-header">
                <h2 className="od-panel-title adm-panel-title">
                  Historique
                  <span className="od-panel-title-meta adm-panel-title-meta">
                    {order.events.length + adminActions.length} événement{order.events.length + adminActions.length > 1 ? 's' : ''}
                    {adminActions.length > 0 && ` · ${adminActions.length} admin`}
                  </span>
                </h2>
              </div>
              <div className="od-timeline">
                {(() => {
                  // Merge OrderEvents (system) + AdminAuditEvents (human admin
                  // actions) en un seul flux trié desc.
                  const merged: Array<
                    | { kind: 'event'; id: string; createdAt: Date; eventKind: OrderEventKind; data: string | null }
                    | { kind: 'admin'; id: string; createdAt: Date; auditKind: string; adminEmail: string; data: string | null }
                  > = [
                    ...order.events.map((e) => ({
                      kind: 'event' as const,
                      id: e.id,
                      createdAt: e.createdAt,
                      eventKind: e.kind as OrderEventKind,
                      data: e.data,
                    })),
                    ...adminActions.map((a) => ({
                      kind: 'admin' as const,
                      id: a.id,
                      createdAt: a.createdAt,
                      auditKind: a.kind,
                      adminEmail: a.adminEmail,
                      data: a.data,
                    })),
                  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

                  if (merged.length === 0) {
                    return (
                      <div style={{ padding: '32px 22px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                        Aucun événement encore.
                      </div>
                    );
                  }

                  return merged.map((item) => {
                    if (item.kind === 'event') {
                      const meta = EVENT_LABEL[item.eventKind];
                      return (
                        <div
                          key={`evt:${item.id}`}
                          className="od-tl-event"
                          style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 14, padding: '14px 22px', borderTop: '1px solid var(--border-subtle)' }}
                        >
                          <div className={`od-tl-dot ${meta.dot}`}>{meta.icon}</div>
                          <div className="od-tl-body">
                            <div className="od-tl-type">{meta.type}</div>
                            <div className="od-tl-title">{meta.title}</div>
                            {item.data && (
                              <details className="od-tl-payload" style={{ marginTop: 6 }}>
                                <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>payload</summary>
                                <pre style={{ fontSize: 11, padding: 10, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', marginTop: 6, overflowX: 'auto' }}>
{item.data}
                                </pre>
                              </details>
                            )}
                          </div>
                          <span className="od-tl-time">
                            {formatDate(item.createdAt.toISOString())} · {timeOf(item.createdAt)}
                          </span>
                        </div>
                      );
                    }
                    // Admin action row
                    const friendly = friendlyAdminAction(item.auditKind, item.data);
                    return (
                      <div
                        key={`adm:${item.id}`}
                        className="od-tl-event"
                        style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 14, padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', background: 'var(--accent-soft)' }}
                      >
                        <div
                          className="od-tl-dot"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'var(--accent-primary)',
                            color: '#fff',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 14,
                          }}
                          aria-hidden
                        >
                          👤
                        </div>
                        <div className="od-tl-body">
                          <div className="od-tl-type" style={{ color: 'var(--accent-primary)' }}>
                            Action admin · {item.adminEmail}
                          </div>
                          <div className="od-tl-title">{friendly}</div>
                          {item.data && (
                            <details className="od-tl-payload" style={{ marginTop: 6 }}>
                              <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>payload</summary>
                              <pre style={{ fontSize: 11, padding: 10, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', marginTop: 6, overflowX: 'auto' }}>
{item.data}
                              </pre>
                            </details>
                          )}
                        </div>
                        <span className="od-tl-time">
                          {formatDate(item.createdAt.toISOString())} · {timeOf(item.createdAt)}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </section>

            <section className="od-panel adm-panel">
              <div className="od-panel-head adm-panel-header">
                <h2 className="od-panel-title adm-panel-title">
                  Articles
                  <span className="od-panel-title-meta adm-panel-title-meta">
                    {order.itemsCount} article{order.itemsCount > 1 ? 's' : ''}
                  </span>
                </h2>
              </div>
              <div style={{ padding: 22 }}>
                {(() => {
                  const items = parseItemsSnapshot(order.itemsSnapshot);
                  if (items && items.length > 0) {
                    return items.map((item, idx) => (
                      <div
                        key={`${item.productId}-${idx}`}
                        className="od-item"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '72px 1fr auto',
                          gap: 16,
                          padding: '14px 0',
                          borderTop: idx > 0 ? '1px solid var(--border-subtle)' : 'none',
                        }}
                      >
                        <div className="od-item-thumb" style={{ width: 72, height: 48, background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-primary)', fontWeight: 600 }}>
                          #{String(idx + 1).padStart(2, '0')}
                        </div>
                        <div className="od-item-info">
                          <div className="od-item-name" style={{ fontWeight: 600, fontSize: 14 }}>{item.productName}</div>
                          <div className="od-item-opts" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                            {item.options.map((opt, i) => (
                              <span key={i} className="od-chip badge badge-neutral">{opt.group}: {opt.label}</span>
                            ))}
                            {item.qtyLabel && (
                              <span className="od-chip badge badge-neutral">Qté · {formatNumber(item.qty)}</span>
                            )}
                            {item.turnaround && (
                              <span className="od-chip badge badge-neutral">{item.turnaround}</span>
                            )}
                          </div>
                          {item.fileNames && item.fileNames.length > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                              📎 {item.fileNames.join(' · ')}
                            </div>
                          )}
                        </div>
                        <div className="od-item-price" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                          {items.length > 1 ? `${idx + 1}/${items.length}` : ''}
                        </div>
                      </div>
                    ));
                  }
                  // Fallback : vieille order pré-Phase 2
                  return (
                    <div className="od-item" style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto', gap: 16, padding: '14px 0' }}>
                      <div className="od-item-thumb" style={{ width: 72, height: 48, background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)' }}></div>
                      <div className="od-item-info">
                        <div className="od-item-name" style={{ fontWeight: 600, fontSize: 14 }}>{order.productSummary ?? 'Commande Plio'}</div>
                        <div className="od-item-opts" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                          <span className="od-chip badge badge-neutral">{order.itemsCount} article{order.itemsCount > 1 ? 's' : ''}</span>
                          <span className="od-chip badge badge-neutral">{order.shippingMethod}</span>
                          <span className="od-chip badge badge-neutral">{order.province}</span>
                        </div>
                      </div>
                      <div className="od-item-price" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>
                        {formatCurrency(order.subtotalCents / 100)}
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'grid', gap: 6, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', fontSize: 13 }}>
                  <Row label="Sous-total" value={formatCurrency(order.subtotalCents / 100)} />
                  <Row label="Livraison" value={formatCurrency(order.shippingCents / 100)} />
                  <Row label="Taxes" value={formatCurrency(order.taxCents / 100)} />
                  <Row label="Total payé" value={`${formatCurrency(order.amountCents / 100)} CAD`} bold />
                </div>
              </div>
            </section>

          </div>

          {/* ─── Right sticky rail ─── */}
          <aside style={{ position: 'sticky', top: 32, display: 'grid', gap: 16, alignSelf: 'start' }}>

            <Card label="Client">
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{order.user.name ?? order.shipName}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{order.user.email}</div>
              {order.user.phone && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{order.user.phone}</div>}
              <Link
                href={`/admin/users/${order.userId}` as Route}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-primary)', marginTop: 8, display: 'inline-block', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}
              >
                Voir le profil →
              </Link>
            </Card>

            <Card label="Adresse de livraison">
              <div className="od-addr" style={{ fontSize: 13, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600 }}>{order.shipName}</div>
                <div>{order.shipLine1}</div>
                {order.shipLine2 && <div>{order.shipLine2}</div>}
                <div>{order.shipCity}, {order.shipProvince} {order.shipPostalCode}</div>
                <div style={{ color: 'var(--text-muted)' }}>{order.shipPhone}</div>
              </div>
            </Card>

            <Card label="Sinalite">
              <KV k="Order ID" v={order.sinaliteOrderId ?? '—'} mono />
              <KV k="Status" v={STATUS_LABELS[status]} />
              {order.failureReason && <KV k="Échec" v={order.failureReason} />}
            </Card>

            <Card label="Stripe">
              <KV k="PaymentIntent" v={order.paymentIntentId.slice(0, 24) + '…'} mono />
              <KV k="Montant" v={`${formatCurrency(order.amountCents / 100)} ${order.currency}`} />
              {order.paidAt && <KV k="Payé le" v={formatDate(order.paidAt.toISOString())} />}
              <a
                href={`https://dashboard.stripe.com/test/payments/${order.paymentIntentId}`}
                target="_blank"
                rel="noopener"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-primary)', marginTop: 8, display: 'inline-block', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}
              >
                Voir sur Stripe ↗
              </a>
            </Card>

            <Card label="Actions">
              <OrderActions
                orderId={order.id}
                status={order.status}
                amountCents={order.amountCents}
                hasSinaliteId={!!order.sinaliteOrderId}
              />
              <div style={{ marginTop: 8 }}>
                <SendCustomMessageButton orderId={order.id} customerEmail={order.user.email} />
              </div>
              <a
                href={`/api/orders/${order.id}/invoice.pdf`}
                download
                title="Télécharge la facture PDF officielle (TPS/TVQ) du client"
                style={{
                  display: 'block',
                  marginTop: 8,
                  padding: '10px 12px',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: 'left',
                  textDecoration: 'none',
                  color: 'var(--text-primary)',
                }}
              >
                ⬇ Télécharger la facture PDF
              </a>
              <Link
                href={`/order/start?reorder=${order.id}` as Route}
                title="Repart le wizard avec les mêmes options pour ce client"
                style={{
                  display: 'block',
                  marginTop: 8,
                  padding: '10px 12px',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: 'left',
                  textDecoration: 'none',
                  color: 'var(--text-primary)',
                }}
              >
                ↻ Recommander cette commande
              </Link>
            </Card>

            <Card label="Notes internes (admin)">
              <AdminNotesPanel orderId={order.id} initialNotes={order.adminNotes} />
            </Card>

          </aside>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="od-card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: 18 }}>
      <div className="od-card-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontWeight: mono ? 500 : 400, marginLeft: 12, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: bold ? 15 : 13, fontWeight: bold ? 600 : 400 }}>
      <span style={{ color: bold ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

function timeOf(d: Date): string {
  return d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Génère un label human-readable depuis un AdminAuditEvent.kind + data JSON.
 * Le `kind` est générique (ADMIN_TEMPLATE_EDIT etc.) — on regarde dans `data.action`
 * pour les sous-actions (refund, cancel, note, view-as).
 */
function friendlyAdminAction(kind: string, dataJson: string | null): string {
  let data: { action?: string; reason?: string; refundCents?: number } = {};
  try {
    if (dataJson) data = JSON.parse(dataJson);
  } catch {
    // ignore
  }

  const action = data.action ?? kind;

  // Specific actions
  if (action === 'ADMIN_MANUAL_REFUND' || kind === 'ADMIN_MANUAL_REFUND') {
    const amount = data.refundCents !== undefined ? ` ($${(data.refundCents / 100).toFixed(2)})` : '';
    return `Remboursement manuel${amount}${data.reason ? ` · ${data.reason}` : ''}`;
  }
  if (action === 'ADMIN_MANUAL_CANCEL' || kind === 'ADMIN_MANUAL_CANCEL') {
    return `Annulation manuelle${data.reason ? ` · ${data.reason}` : ''}`;
  }
  if (action === 'ADMIN_RESEND_EMAIL' || kind === 'ADMIN_RESEND_EMAIL') {
    return 'Renvoi d\'un email';
  }
  if (action === 'ADMIN_VIEW_AS_USER' || kind === 'ADMIN_VIEW_AS_USER') {
    return 'Consultation depuis le compte client (view-as)';
  }
  if (action === 'WEBHOOK_REPLAY') {
    return 'Replay d\'un webhook';
  }
  if (action?.startsWith?.('USER_BULK_')) {
    return `Action bulk : ${action.replace('USER_BULK_', '').toLowerCase()}`;
  }
  return `Action : ${action.toLowerCase().replace(/_/g, ' ')}`;
}
