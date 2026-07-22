/**
 * MonthlySpendChart — bar chart CSS-only des dépenses customer 6 derniers
 * mois. Server Component (no JS shipped, no chart lib).
 *
 * Round 23 #4. Use case : user voit son spending pattern, sait si il
 * spend plus/moins qu'avant.
 *
 * Pas de chart lib pour MVP — bars CSS pures, height = % vs max. Si on
 * veut interactivité (hover details, click zoom), upgrade vers Recharts
 * dans un round futur.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { formatCurrency } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';

interface OrderForChart {
  paidAt: Date | null;
  amountCents: number;
}

/** Build une liste de 6 buckets mensuels [oldest, ..., currentMonth]. */
function buildMonthlyBuckets(orders: OrderForChart[]): Array<{
  label: string;
  ymKey: string;
  totalCents: number;
  count: number;
}> {
  const now = new Date();
  const buckets: Array<{ label: string; ymKey: string; totalCents: number; count: number }> = [];

  // 6 derniers mois, du plus vieux au plus récent
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ymKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-CA', { month: 'short', year: '2-digit' });
    buckets.push({ label, ymKey, totalCents: 0, count: 0 });
  }

  // Aggregate orders dans les buckets
  for (const o of orders) {
    if (!o.paidAt) continue;
    const ymKey = `${o.paidAt.getFullYear()}-${String(o.paidAt.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.find((b) => b.ymKey === ymKey);
    if (bucket) {
      bucket.totalCents += o.amountCents;
      bucket.count += 1;
    }
  }

  return buckets;
}

export default function MonthlySpendChart({ orders }: { orders: OrderForChart[] }) {
  // Hide si zéro order — pas de UX vide qui décourage
  if (orders.filter((o) => o.paidAt).length === 0) return null;

  const buckets = buildMonthlyBuckets(orders);
  const totalCents = buckets.reduce((sum, b) => sum + b.totalCents, 0);
  const maxCents = Math.max(...buckets.map((b) => b.totalCents), 1);
  const monthsWithSpend = buckets.filter((b) => b.totalCents > 0).length;
  const avgMonthly = monthsWithSpend > 0 ? totalCents / monthsWithSpend : 0;

  return (
    <section style={{
      padding: 24,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--r-xl)',
      marginBottom: 24,
    }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 20,
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          letterSpacing: '-0.01em',
          margin: 0,
          fontWeight: 400,
        }}>
          <Icon name="chart" size={14} /> Tes dépenses · 6 derniers mois
        </h2>
        <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          <span>
            Total : <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalCents / 100)}</strong>
          </span>
          {monthsWithSpend > 0 && (
            <span>
              Moy/mois actif : <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(avgMonthly / 100)}</strong>
            </span>
          )}
        </div>
      </header>

      {/* Bar chart — flex avec hauteur fixe + bars % */}
      <div style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        height: 160,
        marginBottom: 8,
        paddingBottom: 4,
        borderBottom: '1px solid var(--border-default)',
      }}>
        {buckets.map((b) => {
          const heightPct = (b.totalCents / maxCents) * 100;
          const isEmpty = b.totalCents === 0;
          return (
            <div
              key={b.ymKey}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                position: 'relative',
                height: '100%',
              }}
              title={isEmpty ? `${b.label} : aucune dépense` : `${b.label} : ${formatCurrency(b.totalCents / 100)} (${b.count} commande${b.count > 1 ? 's' : ''})`}
            >
              {!isEmpty && (
                <span style={{
                  position: 'absolute',
                  top: `calc(100% - ${heightPct}% - 18px)`,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                }}>
                  {(b.totalCents / 100).toFixed(0)} $
                </span>
              )}
              <div
                style={{
                  width: '100%',
                  height: isEmpty ? '2%' : `${heightPct}%`,
                  background: isEmpty ? 'var(--border-default)' : 'var(--accent-primary)',
                  borderRadius: '4px 4px 0 0',
                  minHeight: 4,
                  opacity: isEmpty ? 0.4 : 1,
                  transition: 'height 0.3s',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div style={{
        display: 'flex',
        gap: 8,
      }}>
        {buckets.map((b) => (
          <div
            key={`label-${b.ymKey}`}
            style={{
              flex: 1,
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              textAlign: 'center',
              letterSpacing: '0.04em',
            }}
          >
            {b.label}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Link
          href={'/orders' as Route}
          style={{ fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}
        >
          Voir toutes les commandes →
        </Link>
      </div>
    </section>
  );
}
