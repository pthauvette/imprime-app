/**
 * OrderEventsTimeline — historique détaillé d'un order.
 *
 * Affiche chaque OrderEvent comme un row sur une timeline verticale
 * avec dot coloré (selon kind) + label friendly + timestamp + détail
 * extrait du payload JSON quand pertinent (tracking, status sinalite,
 * refund amount, etc.).
 *
 * Server-safe (pas de hooks, pas d'event handlers). Drop-in pour
 * /orders/[id] (customer) ET /admin/orders/[id] si on veut.
 */

import type { OrderEventKind } from '@/lib/db/orders';
import { describeEvent, KIND_LABELS } from '@/lib/orders/event-describe';
import { formatDate } from '@/lib/format';

interface OrderEvent {
  id: string;
  kind: string;
  data: string | null;
  createdAt: Date;
}

interface Props {
  events: OrderEvent[];
  /** Si true, affiche les event ERROR (admin only). Default false (cache du customer). */
  showErrors?: boolean;
}

const KIND_TONES: Record<OrderEventKind, 'success' | 'danger' | 'info' | 'warning' | 'muted'> = {
  PAYMENT_SUCCEEDED: 'success',
  PAYMENT_FAILED: 'danger',
  SINALITE_SUBMITTED: 'info',
  SINALITE_STATUS_CHANGED: 'info',
  REFUND_ISSUED: 'warning',
  ERROR: 'danger',
  CANCEL_REQUESTED: 'warning',
};

const KIND_DOTS: Record<OrderEventKind, string> = {
  PAYMENT_SUCCEEDED: '✓',
  PAYMENT_FAILED: '✕',
  SINALITE_SUBMITTED: '↗',
  SINALITE_STATUS_CHANGED: '⟳',
  REFUND_ISSUED: '↩',
  ERROR: '!',
  CANCEL_REQUESTED: '⚠',
};

const TONE_COLORS: Record<'success' | 'danger' | 'info' | 'warning' | 'muted', { bg: string; color: string }> = {
  success: { bg: 'var(--success-soft, #f0fdf4)', color: 'var(--success, #16a34a)' },
  danger: { bg: 'var(--danger-soft, #fef2f2)', color: 'var(--danger, #dc2626)' },
  info: { bg: 'var(--accent-soft)', color: 'var(--accent-primary)' },
  warning: { bg: 'var(--warning-soft, #fff7ed)', color: 'var(--warning, #D97706)' },
  muted: { bg: 'var(--bg-sunken)', color: 'var(--text-muted)' },
};

function timeShort(d: Date): string {
  return d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function OrderEventsTimeline({ events, showErrors = false }: Props) {
  const visible = showErrors ? events : events.filter((e) => e.kind !== 'ERROR');

  if (visible.length === 0) {
    return (
      <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Aucun événement enregistré pour le moment. La timeline se remplira au fur et à mesure
        que ta commande avance.
      </div>
    );
  }

  // Trier du plus récent au plus ancien — le user voit l'activité fraîche en haut
  const sorted = [...visible].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <ol
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'grid',
        gap: 0,
        position: 'relative',
      }}
    >
      {sorted.map((event, i) => {
        const kind = event.kind as OrderEventKind;
        const label = KIND_LABELS[kind] ?? event.kind;
        const tone = KIND_TONES[kind] ?? 'muted';
        const dot = KIND_DOTS[kind] ?? '·';
        const { bg, color } = TONE_COLORS[tone];
        const detail = describeEvent(event);
        const isLast = i === sorted.length - 1;

        return (
          <li
            key={event.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr auto',
              gap: 14,
              padding: '8px 0',
              position: 'relative',
            }}
          >
            {/* Vertical connector line */}
            {!isLast && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 16,
                  top: 36,
                  bottom: -8,
                  width: 1,
                  background: 'var(--border-subtle)',
                }}
              />
            )}
            <span
              aria-hidden
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: bg,
                color,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 14,
                fontFamily: 'var(--font-mono)',
                border: `1px solid ${color}`,
                zIndex: 1,
              }}
            >
              {dot}
            </span>
            <div style={{ minWidth: 0, paddingTop: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {label}
              </div>
              {detail && (
                <div style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                  fontFamily: detail.includes('Tracking') || detail.includes('Numéro presse') ? 'var(--font-mono)' : 'inherit',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}>
                  {detail}
                </div>
              )}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                paddingTop: 7,
                textAlign: 'right',
              }}
              title={event.createdAt.toISOString()}
            >
              <div>{formatDate(event.createdAt.toISOString())}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>{timeShort(event.createdAt)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
