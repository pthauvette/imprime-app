/**
 * ProductionStatusWidget — affiche les orders du user en cours de
 * production sur /account dashboard. Server Component.
 *
 * Round 21 #3. Status PAID / SUBMITTED / IN_PRODUCTION / SHIPPED affichés
 * avec progress bar visuelle (4 étapes), date estimée, lien vers détail.
 *
 * Si zéro order in-progress, le widget se hide gracefully (caller fait
 * la vérification du count via la prop).
 */

import Link from 'next/link';
import type { Route } from 'next';
import { formatDate } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import { computeOrderEta, extractTracking } from '@/lib/orders/timeline';

interface OrderForWidget {
  id: string;
  sinaliteOrderId: string | null;
  status: string;
  productSummary: string | null;
  itemsCount: number;
  createdAt: Date;
  paidAt: Date | null;
  /** Triés ASC (oldest→newest) — même contrat que computeOrderEta/extractTracking. */
  events: { kind: string; data: string | null; createdAt: Date }[];
}

/**
 * Map status → step number (1-4) pour la progress bar. SHIPPED = 3
 * (livraison en cours), DELIVERED = 4 (mais filtré upstream, on n'affiche
 * pas DELIVERED dans "en production").
 */
const STATUS_STEPS: Record<string, { step: number; label: string }> = {
  PAID: { step: 1, label: 'Confirmée' },
  SUBMITTED: { step: 2, label: 'Soumise à l\'imprimeur' },
  IN_PRODUCTION: { step: 3, label: 'En production' },
  SHIPPED: { step: 4, label: 'Expédiée' },
};

export default function ProductionStatusWidget({ orders }: { orders: OrderForWidget[] }) {
  if (orders.length === 0) return null;

  return (
    <section style={{
      padding: 24,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--r-xl)',
      marginBottom: 24,
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          letterSpacing: '-0.01em',
          margin: 0,
          fontWeight: 400,
        }}>
          <Icon name="printer" size={14} /> En production · {orders.length}
        </h2>
      </header>

      <div style={{ display: 'grid', gap: 12 }}>
        {orders.map((o) => {
          const meta = STATUS_STEPS[o.status] ?? { step: 0, label: o.status };
          const displayId = o.sinaliteOrderId ?? o.id.slice(-6).toUpperCase();
          // Round expérience-client [44] — le widget disait « refresh la page »
          // au lieu d'afficher ce qu'on sait déjà (ETA + tracking, mêmes
          // helpers que /orders/[id]).
          const shippedEvent = [...o.events].reverse().find(
            (e) => e.kind === 'SINALITE_STATUS_CHANGED' && e.data?.includes('SHIPPED'),
          );
          const tracking = extractTracking(o.events);
          const eta = computeOrderEta(o, shippedEvent?.createdAt);
          return (
            <Link
              key={o.id}
              href={`/orders/${o.id}` as Route}
              style={{
                display: 'block',
                padding: 16,
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em', fontWeight: 600 }}>
                    #{displayId}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginLeft: 12 }}>
                    {o.productSummary ?? `${o.itemsCount} article${o.itemsCount > 1 ? 's' : ''}`}
                  </span>
                </div>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--accent-primary)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {meta.label}
                </span>
              </div>

              {/* Progress bar 4 steps */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    style={{
                      flex: 1,
                      height: 4,
                      background: s <= meta.step ? 'var(--accent-primary)' : 'var(--border-default)',
                      borderRadius: 2,
                      transition: 'background 0.3s',
                    }}
                    aria-label={`Étape ${s}: ${s <= meta.step ? 'fait' : 'à venir'}`}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                <span>Payée</span>
                <span>Soumise</span>
                <span>En prod</span>
                <span>Expédiée</span>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Commandée le {formatDate(o.createdAt.toISOString())}
                {o.paidAt && ` · payée le ${formatDate(o.paidAt.toISOString())}`}
                {eta && ` · reçue ${eta.relative}`}
                {tracking && ` · suivi ${tracking.carrier} ${tracking.number}`}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
