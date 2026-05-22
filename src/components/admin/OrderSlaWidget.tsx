/**
 * Round 25 #3 — Widget Server Component qui display les SLA Order
 * (time-to-submit + time-to-ship) en P50 / P95 sur 30 derniers jours.
 *
 * Server-rendered, zéro JS — les valeurs sont déjà computed côté caller
 * (page admin/orders) et passées en props.
 *
 * Color cues :
 *   - vert si P50 < 4h (excellent)
 *   - default (text-primary) si 4h ≤ P50 < 24h (normal)
 *   - warning si P50 ≥ 24h (lent → enquêter)
 */

import type { OrderSlaMetrics, SlaBucket } from '@/lib/admin/order-sla';

const HEALTHY_HOURS = 4;
const WARN_HOURS = 24;

function pickColor(p50: number | null): string {
  if (p50 === null) return 'var(--text-muted)';
  if (p50 < HEALTHY_HOURS) return 'var(--success, #16a34a)';
  if (p50 < WARN_HOURS) return 'var(--text-primary)';
  return 'var(--warning, #D97706)';
}

function formatHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h} h`;
  return `${(h / 24).toFixed(1)} j`;
}

function SlaCell({ label, bucket }: { label: string; bucket: SlaBucket }) {
  const color = pickColor(bucket.p50Hours);
  return (
    <div style={{ flex: 1, padding: '12px 16px' }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>P50</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color, fontWeight: 400 }}>
            {formatHours(bucket.p50Hours)}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>P95</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-secondary)', fontWeight: 400 }}>
            {formatHours(bucket.p95Hours)}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        {bucket.sampleSize === 0 ? 'aucun échantillon' : `n = ${bucket.sampleSize}`}
      </div>
    </div>
  );
}

export default function OrderSlaWidget({ metrics }: { metrics: OrderSlaMetrics }) {
  return (
    <section
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-xl)',
        padding: 4,
        display: 'flex',
        alignItems: 'stretch',
        marginBottom: 16,
      }}
      aria-label="SLA Plio — 30 derniers jours"
    >
      <div
        style={{
          padding: '12px 16px',
          minWidth: 140,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          borderRight: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}
        >
          SLA · 30 j
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
          Temps médians + pire-cas raisonnable
        </div>
      </div>
      <SlaCell label="Paiement → Soumis à Sinalite" bucket={metrics.timeToSubmit} />
      <SlaCell label="Soumis à Sinalite → Expédié" bucket={metrics.timeToShip} />
    </section>
  );
}
