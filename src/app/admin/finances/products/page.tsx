/**
 * /admin/finances/products — Sales breakdown par produit pour la période.
 *
 * Server Component qui :
 *   1. Fetch les orders payées dans la période
 *   2. Parse itemsSnapshot de chaque order pour extraire les items
 *   3. Aggregate par productId (count orders, count units, est. revenue)
 *   4. Affiche un tableau triable
 *
 * LIMITES :
 *   - Les orders pré-itemsSnapshot (Phase 1) n'ont qu'un productSummary
 *     libre — on fallback à un bucket "Legacy (1 item)" avec le summary
 *     comme nom de produit.
 *   - Revenue estimé : on divise subtotal proportionnellement au qty
 *     total de l'order. Imparfait pour multi-item de différents prix
 *     unitaires, mais bon enough pour MVP analytics.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { Icon } from '@/components/ui/Icon';
import { parseItemsSnapshot } from '@/lib/orders/items';
import { formatCurrency, formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Sales par produit' };

const PAID_STATUSES = ['PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'];

type Preset = '7d' | '30d' | '90d' | 'ytd';

const PRESET_DAYS: Record<Preset, number | 'ytd'> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  ytd: 'ytd',
};

const PRESET_LABELS: Record<Preset, string> = {
  '7d': '7 jours',
  '30d': '30 jours',
  '90d': '90 jours',
  ytd: 'YTD',
};

function resolveRange(preset: Preset, now: Date): Date {
  const v = PRESET_DAYS[preset];
  if (v === 'ytd') return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getTime() - v * 24 * 3600 * 1000);
}

interface ProductStat {
  productId: number | 'legacy';
  productName: string;
  orderCount: number;
  unitCount: number;
  estRevenueCents: number;
  /** Set d'order IDs pour count unique (un order peut contenir plusieurs items du même produit). */
  orderIds: Set<string>;
}

export default async function ProductsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  const { session } = await requireAdminPage();
  const { preset: presetRaw } = await searchParams;
  const preset: Preset = (['7d', '30d', '90d', 'ytd'] as const).includes(presetRaw as Preset)
    ? (presetRaw as Preset)
    : '30d';

  const now = new Date();
  const since = resolveRange(preset, now);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: PAID_STATUSES },
      paidAt: { gte: since, not: null },
    },
    select: {
      id: true,
      subtotalCents: true,
      productSummary: true,
      itemsSnapshot: true,
      itemsCount: true,
    },
  });

  // Aggregate per product
  const statsByProduct = new Map<number | string, ProductStat>();
  let totalOrders = 0;
  let totalSubtotalCents = 0;

  for (const order of orders) {
    totalOrders++;
    totalSubtotalCents += order.subtotalCents;
    const items = parseItemsSnapshot(order.itemsSnapshot);

    if (!items || items.length === 0) {
      // Legacy fallback
      const key = 'legacy';
      const name = order.productSummary ?? 'Commande sans détail item';
      const existing = statsByProduct.get(key) ?? {
        productId: 'legacy' as const,
        productName: name,
        orderCount: 0,
        unitCount: 0,
        estRevenueCents: 0,
        orderIds: new Set(),
      };
      existing.orderCount = existing.orderIds.add(order.id).size;
      existing.unitCount += order.itemsCount;
      existing.estRevenueCents += order.subtotalCents;
      statsByProduct.set(key, existing);
      continue;
    }

    const totalQty = items.reduce((sum, it) => sum + (it.qty || 0), 0) || items.length;

    for (const item of items) {
      const existing = statsByProduct.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName,
        orderCount: 0,
        unitCount: 0,
        estRevenueCents: 0,
        orderIds: new Set<string>(),
      };
      existing.orderIds.add(order.id);
      existing.orderCount = existing.orderIds.size;
      existing.unitCount += item.qty || 0;
      // Distribute subtotal proportionnel au qty
      const itemQty = item.qty || 1;
      existing.estRevenueCents += Math.round((order.subtotalCents * itemQty) / totalQty);
      statsByProduct.set(item.productId, existing);
    }
  }

  // Sort by est revenue desc
  const stats = Array.from(statsByProduct.values()).sort((a, b) => b.estRevenueCents - a.estRevenueCents);

  const [ordersCount, usersCount] = await Promise.all([
    prisma.order.count(),
    prisma.user.count(),
  ]);

  const fmtDate = (d: Date) => d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="finances-products"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Sales par produit</h1>
            <p className="adm-page-subtitle">
              Quels produits Sinalite vendent le plus chez Plio · {PRESET_LABELS[preset]}
            </p>
          </div>
          <div className="adm-topbar-actions">
            <Link href={'/admin/finances' as Route} className="btn btn-ghost btn-sm">← Finances</Link>
          </div>
        </header>

        <section style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {(Object.keys(PRESET_DAYS) as Preset[]).map((p) => {
            const isActive = preset === p;
            return (
              <Link
                key={p}
                href={`/admin/finances/products?preset=${p}` as Route}
                style={{
                  padding: '8px 14px',
                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {PRESET_LABELS[p]}
              </Link>
            );
          })}
        </section>

        <div style={{ marginBottom: 24, padding: '12px 16px', background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--text-secondary)' }}>
          <Icon name="calendar" /> Depuis : <strong>{fmtDate(since)}</strong> · {totalOrders} commande{totalOrders > 1 ? 's' : ''} · {formatCurrency(totalSubtotalCents / 100)} subtotal · {statsByProduct.size} produit{statsByProduct.size > 1 ? 's' : ''} unique{statsByProduct.size > 1 ? 's' : ''}
        </div>

        <section className="adm-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {stats.length === 0 ? (
            <div style={{ padding: '64px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: 8 }}><Icon name="chart" size={44} /></div>
              Aucune commande dans cette période.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--bg-sunken)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 600 }}>Produit</th>
                  <th style={{ textAlign: 'right', padding: '12px 18px', fontWeight: 600 }}>Commandes</th>
                  <th style={{ textAlign: 'right', padding: '12px 18px', fontWeight: 600 }}>Unités</th>
                  <th style={{ textAlign: 'right', padding: '12px 18px', fontWeight: 600 }}>Revenu estimé</th>
                  <th style={{ textAlign: 'right', padding: '12px 18px', fontWeight: 600 }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => {
                  const sharePct = totalSubtotalCents > 0 ? (s.estRevenueCents / totalSubtotalCents) * 100 : 0;
                  return (
                    <tr key={String(s.productId)} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
                      <td style={{ padding: '14px 18px', fontSize: 13 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.productName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                          {s.productId === 'legacy' ? 'legacy (pré-itemsSnapshot)' : `productId ${s.productId}`}
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {s.orderCount}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {formatNumber(s.unitCount)}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-primary)' }}>
                        {formatCurrency(s.estRevenueCents / 100)}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 12, textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {sharePct.toFixed(1)} %
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 24, maxWidth: 600, marginInline: 'auto', lineHeight: 1.5 }}>
          <Icon name="info" /> Le revenu estimé distribue le subtotal d&apos;une commande proportionnellement
          aux quantités des items. Pour des commandes multi-produits avec prix unitaires
          très différents, l&apos;estimation peut diverger du vrai split. Pour la compta
          précise, utilise le <Link href={'/admin/finances/tax-report' as Route} style={{ color: 'var(--accent-primary)' }}>rapport de taxes</Link>.
        </p>
      </main>
    </div>
  );
}
