/**
 * /admin/webhooks/[id] — Detail d'un WebhookEvent pour debug.
 *
 * Use case admin : un webhook a échoué (success=false ou outcome bizarre).
 * Cette page montre :
 *   - Méta : source, eventType, eventId, processedAt, latencyMs, statusCode
 *   - Outcome : success/error + replay counter
 *   - Payload JSON pretty-printed (collapsible)
 *   - Lien vers l'Order associée si résolue (orderId)
 *   - Side-by-side : payload key fields vs current Order state pour spot
 *     les divergences (ex: webhook dit SHIPPED mais Order.status est PAID)
 *   - Bouton Replay (réutilise ReplayButton existant)
 *
 * Format JSON : on parse + re-stringify avec indent 2 pour lisibilité.
 * Si parse fail, on affiche raw text.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { prisma } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin-auth';
import { formatDateTime } from '@/lib/format';
import ReplayButton from '../ReplayButton';

export const metadata = { title: 'Admin — Webhook detail' };
export const dynamic = 'force-dynamic';

export default async function AdminWebhookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requireAdminPage();
  const { id } = await params;

  const event = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!event) notFound();

  const order = event.orderId
    ? await prisma.order.findUnique({
        where: { id: event.orderId },
        include: {
          user: { select: { email: true, name: true } },
          events: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      })
    : null;

  // Pretty-print the payload — fall back to raw if not valid JSON
  let payloadPretty: string;
  let payloadParsed: unknown = null;
  if (event.payload) {
    try {
      payloadParsed = JSON.parse(event.payload);
      payloadPretty = JSON.stringify(payloadParsed, null, 2);
    } catch {
      payloadPretty = event.payload;
    }
  } else {
    payloadPretty = '(payload absent — pré-migration add_webhook_event_payload)';
  }

  // Extract key fields depending on source — useful for the diff view
  const payloadKey = extractKeyFields(event.source, payloadParsed);

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="webhooks"
        user={
          session?.user
            ? {
                name: session.user.name ?? null,
                email: session.user.email ?? '',
                role: session.user.role,
              }
            : undefined
        }
      />

      <main className="adm-main" style={{ padding: '40px 48px 80px' }}>
        <div style={{ marginBottom: 16 }}>
          <Link
            href={'/admin/webhooks' as Route}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            ← Webhooks
          </Link>
        </div>

        <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="page-eyebrow">{event.source}</div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 36,
                letterSpacing: '-0.025em',
                fontWeight: 400,
                margin: '8px 0 4px',
              }}
            >
              {event.eventType}
            </h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {event.eventId} · {formatDateTime(event.processedAt)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span
              style={{
                padding: '6px 14px',
                background: event.success
                  ? 'var(--success-soft, #f0fdf4)'
                  : 'var(--danger-soft, #fef2f2)',
                color: event.success ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)',
                borderRadius: 'var(--r-pill)',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              {event.success ? `✓ ${event.statusCode ?? 200}` : `✕ ${event.statusCode ?? 500}`}
            </span>
            {event.payload && (
              <ReplayButton
                id={event.id}
                hasPayload={true}
                source={event.source}
                eventType={event.eventType}
                replayCount={event.replayCount}
              />
            )}
          </div>
        </header>

        {/* Outcome row */}
        <section
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg)',
            padding: 20,
            marginBottom: 24,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          <Mini label="Latence" value={event.latencyMs != null ? `${event.latencyMs} ms` : '—'} />
          <Mini
            label="Replays manuels"
            value={
              event.replayCount > 0
                ? `${event.replayCount}× (dernier ${event.lastReplayAt ? formatDateTime(event.lastReplayAt) : '?'})`
                : '—'
            }
          />
          <Mini label="Order liée" value={event.orderId ?? '—'} mono />
          {event.error && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--danger, #dc2626)',
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Erreur
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '10px 14px',
                  background: 'var(--danger-soft, #fef2f2)',
                  border: '1px solid var(--danger, #dc2626)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {event.error}
              </pre>
            </div>
          )}
        </section>

        {/* Side-by-side : payload key fields vs Order DB state */}
        {order && payloadKey.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <h2
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
                margin: '0 0 12px',
              }}
            >
              Diff : payload webhook ↔ état DB actuel
            </h2>
            <DiffTable payloadKey={payloadKey} order={order} />
          </section>
        )}

        {/* Payload pretty */}
        <section>
          <h2
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              fontWeight: 600,
              margin: '0 0 12px',
            }}
          >
            Payload reçu ({event.payload ? `${(event.payload.length / 1024).toFixed(1)} kB` : 'vide'})
          </h2>
          <pre
            style={{
              margin: 0,
              padding: 20,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-lg)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              overflow: 'auto',
              maxHeight: 600,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {payloadPretty}
          </pre>
        </section>

        {order && (
          <section style={{ marginTop: 24 }}>
            <h2
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
                margin: '0 0 12px',
              }}
            >
              Order liée
            </h2>
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-lg)',
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>
                  {order.sinaliteOrderId ? `#SIN-${order.sinaliteOrderId}` : `#${order.id.slice(-6).toUpperCase()}`}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {order.user.email} · status <strong>{order.status}</strong>
                </div>
              </div>
              <Link
                href={`/admin/orders/${order.id}` as Route}
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
              >
                Voir la commande →
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

interface KeyField {
  label: string;
  payloadValue: string | null;
  orderField: 'status' | 'paymentIntentId' | 'sinaliteOrderId' | 'paidAt' | 'amountCents';
}

/**
 * Extrait les clés du payload qui sont pertinentes à comparer avec
 * l'état Order actuel. Permet de spotter les drifts (ex : webhook dit
 * SHIPPED mais Order est encore PAID parce que le handler a échoué).
 */
function extractKeyFields(source: string, payload: unknown): KeyField[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;

  if (source === 'STRIPE') {
    const data = (p.data as Record<string, unknown> | undefined)?.object as
      | Record<string, unknown>
      | undefined;
    if (!data) return [];
    return [
      {
        label: 'PaymentIntent ID',
        payloadValue: typeof data.id === 'string' ? data.id : null,
        orderField: 'paymentIntentId',
      },
      {
        label: 'Amount',
        payloadValue: typeof data.amount === 'number' ? String(data.amount) : null,
        orderField: 'amountCents',
      },
      {
        label: 'Status (PI)',
        payloadValue: typeof data.status === 'string' ? data.status : null,
        orderField: 'status',
      },
    ];
  }

  if (source === 'SINALITE') {
    return [
      {
        label: 'Sinalite Order ID',
        payloadValue: p.orderId != null ? String(p.orderId) : null,
        orderField: 'sinaliteOrderId',
      },
      {
        label: 'Status',
        payloadValue: typeof p.status === 'string' ? p.status : null,
        orderField: 'status',
      },
    ];
  }

  return [];
}

function DiffTable({
  payloadKey,
  order,
}: {
  payloadKey: KeyField[];
  order: {
    status: string;
    paymentIntentId: string;
    sinaliteOrderId: string | null;
    paidAt: Date | null;
    amountCents: number;
  };
}) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
      }}
    >
      <thead>
        <tr style={{ background: 'var(--bg-sunken)', textAlign: 'left' }}>
          <th style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
            Champ
          </th>
          <th style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
            Payload webhook
          </th>
          <th style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
            DB actuel
          </th>
          <th style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
            Δ
          </th>
        </tr>
      </thead>
      <tbody>
        {payloadKey.map((kf) => {
          const dbValue = readOrderField(order, kf.orderField);
          const matches = normalize(kf.payloadValue) === normalize(dbValue);
          return (
            <tr key={kf.label} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500 }}>{kf.label}</td>
              <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {kf.payloadValue ?? '—'}
              </td>
              <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {dbValue ?? '—'}
              </td>
              <td style={{ padding: '12px 16px', fontSize: 12 }}>
                <span
                  style={{
                    padding: '2px 8px',
                    background: matches ? 'var(--success-soft, #f0fdf4)' : 'var(--warning-soft, #FFF6E5)',
                    color: matches ? 'var(--success, #16a34a)' : 'var(--warning, #D97706)',
                    borderRadius: 'var(--r-sm)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {matches ? '✓' : '≠'}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function readOrderField(
  order: { status: string; paymentIntentId: string; sinaliteOrderId: string | null; paidAt: Date | null; amountCents: number },
  field: KeyField['orderField'],
): string | null {
  switch (field) {
    case 'status':
      return order.status;
    case 'paymentIntentId':
      return order.paymentIntentId;
    case 'sinaliteOrderId':
      return order.sinaliteOrderId;
    case 'paidAt':
      return order.paidAt ? order.paidAt.toISOString() : null;
    case 'amountCents':
      return String(order.amountCents);
  }
}

function normalize(v: string | null): string {
  if (v == null) return '';
  return v.trim().toLowerCase();
}

function Mini({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>
        {value}
      </div>
    </div>
  );
}
