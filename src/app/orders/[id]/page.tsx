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
import CancelRequestButton from '@/components/account/CancelRequestButton';
import ShippingEditButton from '@/components/account/ShippingEditButton';
import NpsWidget from '@/components/account/NpsWidget';
import OrderEventsTimeline from '@/components/account/OrderEventsTimeline';
import ViewAsBanner from '@/components/admin/ViewAsBanner';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import type { OrderStatus } from '@/lib/db/orders';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { parseItemsSnapshot } from '@/lib/orders/items';
// Round 38 #1 — Source canonique (Round 37 #5 extract)
import { STATUS_LABELS } from '@/lib/orders/status-labels';
import {
  buildOrderTimeline,
  computeOrderEta,
  extractTracking,
  type TimelineStep,
} from '@/lib/orders/timeline';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Commande ${id.slice(-6).toUpperCase()} — Plio` };
}


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

  // Load NPS response separately — best-effort si migration pas appliquée
  let existingNps: { score: number; comment: string | null } | null = null;
  try {
    existingNps = await prisma.npsResponse.findUnique({
      where: { orderId: order.id },
      select: { score: true, comment: true },
    });
  } catch {
    // Migration pas appliquée yet → skip silently
  }

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
  const tracking = extractTracking(order.events);
  const eta = computeOrderEta(order, shippedEvent?.createdAt);

  const timeline = buildOrderTimeline(order, status);

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

            {/* Historique détaillé — chaque OrderEvent (Round 13 #4).
                Complète le "Suivi en direct" (5 macro-étapes) en montrant
                chaque webhook reçu / chaque transition d'état avec son
                payload friendly (tracking, refund, statut presse…). */}
            {order.events.length > 0 && (
              <section className="panel" style={{ padding: 24, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-xl)' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '-0.01em', margin: '0 0 20px', fontWeight: 400 }}>
                  Historique détaillé
                </h2>
                <OrderEventsTimeline events={order.events} showErrors={isAdmin} />
              </section>
            )}

            <section className="panel" style={{ padding: 24, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-xl)' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '-0.01em', margin: '0 0 20px', fontWeight: 400 }}>
                Détails de la commande
              </h2>

              {/* Items réels depuis itemsSnapshot (Phase 2). Fallback à un
                  fake row avec productSummary si snapshot absent (vieilles
                  orders pré-Phase 2). */}
              {(() => {
                const items = parseItemsSnapshot(order.itemsSnapshot);
                if (items && items.length > 0) {
                  return (
                    <div>
                      {items.map((item, idx) => (
                        <div
                          key={`${item.productId}-${idx}`}
                          className="item-row"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '72px 1fr auto',
                            gap: 16,
                            padding: '14px 0',
                            borderBottom: idx < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                          }}
                        >
                          <div className="item-thumb" style={{ width: 72, height: 48, background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-primary)', fontWeight: 600 }}>
                            #{String(idx + 1).padStart(2, '0')}
                          </div>
                          <div className="item-info">
                            <div className="item-name" style={{ fontWeight: 600, fontSize: 14 }}>
                              {item.productName}
                            </div>
                            <div className="item-options" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                              {item.options.map((opt) => opt.label).join(' · ')}
                              {item.options.length > 0 && (item.qtyLabel || item.turnaround) && ' · '}
                              {item.qtyLabel && <strong style={{ color: 'var(--text-secondary)' }}>{formatNumber(item.qty)} unités</strong>}
                              {item.turnaround && (
                                <>
                                  {item.qtyLabel ? ' · ' : ''}{item.turnaround}
                                </>
                              )}
                            </div>
                            {item.fileNames && item.fileNames.length > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                                📎 {item.fileNames.join(' · ')}
                              </div>
                            )}
                          </div>
                          <div className="item-price" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                            {items.length > 1 ? `Item ${idx + 1}/${items.length}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }
                // Fallback pour les vieilles orders sans snapshot
                return (
                  <div className="item-row" style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="item-thumb" style={{ width: 72, height: 48, background: 'var(--accent-soft)', borderRadius: 'var(--r-sm)' }} />
                    <div className="item-info">
                      <div className="item-name" style={{ fontWeight: 600, fontSize: 14 }}>
                        {order.productSummary ?? 'Commande Plio'}
                      </div>
                      <div className="item-options" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {order.itemsCount} article{order.itemsCount > 1 ? 's' : ''} · {order.shippingMethod}
                      </div>
                    </div>
                    <div className="item-price" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>
                      {formatCurrency(order.subtotalCents / 100)}
                    </div>
                  </div>
                );
              })()}

              <div className="total-breakdown" style={{ display: 'grid', gap: 6, marginTop: 16, fontSize: 13 }}>
                <Line label="Sous-total" value={formatCurrency(order.subtotalCents / 100)} />
                <Line label="Livraison" value={formatCurrency(order.shippingCents / 100)} />
                <Line label="Taxes" value={formatCurrency(order.taxCents / 100)} />
                {order.discountCents > 0 && (
                  <Line label="Remise" value={`- ${formatCurrency(order.discountCents / 100)}`} />
                )}
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
                {/* Round 26 #2 — instructions livraison customer-fournies */}
                {order.shippingNote && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '8px 10px',
                      background: 'var(--bg-sunken)',
                      borderLeft: '3px solid var(--accent-primary)',
                      borderRadius: '4px 6px 6px 4px',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: 700, marginBottom: 4 }}>
                      Instructions
                    </div>
                    {order.shippingNote}
                  </div>
                )}
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

            {/* Round 27 #3 — ICS calendar export (livraison estimée) */}
            {order.status !== 'CANCELLED' && order.status !== 'FAILED' && (
              <a
                href={`/api/orders/${order.id}/calendar.ics`}
                title="Ajouter la livraison estimée à ton calendrier (Google, Apple, Outlook)"
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
                📅 Ajouter au calendrier
              </a>
            )}

            {/* Round 19 #5 — Timeline PDF (vue customer, pas le reçu fiscal) */}
            <a
              href={`/api/orders/${order.id}/timeline.pdf`}
              download
              title="PDF récap de la commande + timeline des événements"
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
              📄 Télécharger l&apos;historique PDF
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

            {status === 'DELIVERED' && (
              <NpsWidget
                orderId={order.id}
                existingScore={existingNps?.score ?? null}
                existingComment={existingNps?.comment ?? null}
              />
            )}

            {/* Round 32 — self-serve modification d'adresse avant SUBMITTED */}
            <ShippingEditButton
              orderId={order.id}
              status={order.status}
              current={{
                shipName: order.shipName,
                shipLine1: order.shipLine1,
                shipLine2: order.shipLine2,
                shipCity: order.shipCity,
                shipProvince: order.shipProvince,
                shipPostalCode: order.shipPostalCode,
                shipPhone: order.shipPhone,
              }}
            />

            <CancelRequestButton orderId={order.id} status={order.status} />

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

// Timeline + tracking + ETA helpers moved to @/lib/orders/timeline so the
// public /track page peut réutiliser exactement la même logique.
