/**
 * /admin/finances/tax-report — UI pour générer le rapport TPS/TVQ/HST/PST.
 *
 * Server Component qui calcule le preview (orders count + breakdown taxes)
 * pour la période sélectionnée + affiche un download CSV button.
 *
 * Use case typique : fin de trimestre, admin/comptable génère le rapport
 * pour remplir les formulaires TPS (FPZ-500) + TVQ (VDZ-471) au Revenu QC.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { computeTaxReport } from '@/lib/finances/tax-report';
import { PAID_STATUSES } from '@/lib/finances/refund-amount';
import { formatCurrency } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Rapport de taxes' };

interface SP {
  from?: string;
  to?: string;
  preset?: string;
}

function defaultQuarterStart(): Date {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) * 3;
  return new Date(now.getFullYear(), q, 1);
}

function resolveRange(preset: string | undefined, fromParam: string | undefined, toParam: string | undefined) {
  const now = new Date();
  if (preset === 'this-month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start, to: now, label: 'Mois en cours' };
  }
  if (preset === 'last-month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from: start, to: end, label: 'Mois précédent' };
  }
  if (preset === 'last-quarter') {
    const q = Math.floor(now.getMonth() / 3) * 3 - 3;
    const start = q >= 0
      ? new Date(now.getFullYear(), q, 1)
      : new Date(now.getFullYear() - 1, q + 12, 1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 3);
    end.setDate(0);
    end.setHours(23, 59, 59);
    return { from: start, to: end, label: 'Trimestre précédent' };
  }
  if (preset === 'ytd') {
    return { from: new Date(now.getFullYear(), 0, 1), to: now, label: 'Year-to-date' };
  }
  if (fromParam && toParam) {
    return {
      from: new Date(fromParam),
      to: new Date(toParam),
      label: 'Custom',
    };
  }
  // Default : trimestre en cours
  return { from: defaultQuarterStart(), to: now, label: 'Trimestre en cours' };
}

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { session } = await requireAdminPage();
  const sp = await searchParams;
  const range = resolveRange(sp.preset, sp.from, sp.to);

  const toEnd = new Date(range.to);
  toEnd.setHours(23, 59, 59, 999);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...PAID_STATUSES] },
      paidAt: { gte: range.from, lte: toEnd, not: null },
    },
    select: {
      id: true,
      paidAt: true,
      shipProvince: true,
      subtotalCents: true,
      discountCents: true,
      resellerDiscountCents: true,
      shippingCents: true,
      taxCents: true,
      amountCents: true,
    },
    take: 50_000,
  });

  // Audit admin 2026-07 §4a — MÊME calcul que l'export CSV via le helper PUR
  // partagé (taxable subtotal réel + NET des remboursements) → écran == export.
  const orderIds = orders.map((o) => o.id);
  const refundEvents = orderIds.length > 0
    ? await prisma.orderEvent.findMany({
        where: { kind: 'REFUND_ISSUED', orderId: { in: orderIds }, createdAt: { gte: range.from, lte: toEnd } },
        include: { order: { select: { amountCents: true } } },
      })
    : [];
  const report = computeTaxReport(orders, refundEvents);
  // Adaptateur en dollars pour le rendu (le helper retourne des cents).
  const summary = {
    gst: report.summary.gstCents / 100,
    pst: report.summary.pstCents / 100,
    qst: report.summary.qstCents / 100,
    hst: report.summary.hstCents / 100,
    subtotal: report.summary.totalSubtotalCents / 100,
    totalTax: report.summary.totalTaxCents / 100,
    charged: report.summary.totalChargedCents / 100,
    orderCount: report.summary.orderCount,
  };
  const provinces = new Map(
    report.byProvince.map((p) => [p.province, { count: p.count, subtotal: p.subtotalCents / 100, tax: p.taxCents / 100 }]),
  );

  const downloadParams = new URLSearchParams({
    from: range.from.toISOString().slice(0, 10),
    to: range.to.toISOString().slice(0, 10),
  });
  const downloadHref = `/api/admin/finances/tax-report?${downloadParams.toString()}`;

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  const [ordersCount, usersCount] = await Promise.all([
    prisma.order.count(),
    prisma.user.count(),
  ]);

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="finances-tax-report"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Rapport de taxes</h1>
            <p className="adm-page-subtitle">
              Pour remise CRA (TPS/GST) + Revenu Québec (TVQ) + HST/PST autres provinces.
            </p>
          </div>
          <div className="adm-topbar-actions">
            <Link href={'/admin/finances' as Route} className="btn btn-ghost btn-sm">← Finances</Link>
            <a href={downloadHref} className="btn btn-primary btn-sm" download>
              <Icon name="download" size={14} /> Télécharger CSV
            </a>
          </div>
        </header>

        {/* Preset selector */}
        <section style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { key: 'this-month', label: 'Mois en cours' },
            { key: 'last-month', label: 'Mois précédent' },
            { key: 'this-quarter', label: 'Trimestre en cours' },
            { key: 'last-quarter', label: 'Trimestre précédent' },
            { key: 'ytd', label: 'YTD' },
          ].map((opt) => {
            const isActive = (sp.preset ?? 'this-quarter') === opt.key;
            return (
              <Link
                key={opt.key}
                href={`/admin/finances/tax-report?preset=${opt.key}` as Route}
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
                {opt.label}
              </Link>
            );
          })}
        </section>

        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--accent-soft)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--accent-primary)', fontWeight: 600 }}>
          <Icon name="calendar" size={14} /> Période : <strong>{fmtDate(range.from)}</strong> → <strong>{fmtDate(range.to)}</strong> · {summary.orderCount} commande{summary.orderCount > 1 ? 's' : ''}
        </div>

        {/* Tax aggregates */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <TaxCard label="TPS / GST (5 %)" amount={summary.gst} hint="À remettre à l'ARC" />
          <TaxCard label="TVQ / QST (9,975 %)" amount={summary.qst} hint="À remettre à Revenu QC" />
          <TaxCard label="HST" amount={summary.hst} hint="ON, NB, NL, NS, PE — combiné" />
          <TaxCard label="PST" amount={summary.pst} hint="BC, SK, MB — provincial seul" />
        </section>

        <section
          style={{
            padding: 24,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 16px' }}>
            Résumé
          </h2>
          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <Row label="Sous-total facturé" value={formatCurrency(summary.subtotal)} />
            <Row label="Total taxes" value={formatCurrency(summary.totalTax)} highlight />
            <Row label="Total chargé (avec shipping)" value={formatCurrency(summary.charged)} bold />
          </div>
        </section>

        {provinces.size > 0 && (
          <section
            style={{
              padding: 24,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-xl)',
            }}
          >
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 16px' }}>
              Détail par province
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600 }}>Province</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600 }}>Commandes</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600 }}>Sous-total</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600 }}>Taxes</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(provinces.entries())
                  .sort((a, b) => b[1].tax - a[1].tax)
                  .map(([prov, stat]) => (
                    <tr key={prov} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 0', fontSize: 13, fontWeight: 600 }}>{prov}</td>
                      <td style={{ padding: '10px 0', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{stat.count}</td>
                      <td style={{ padding: '10px 0', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(stat.subtotal)}</td>
                      <td style={{ padding: '10px 0', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>{formatCurrency(stat.tax)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}

function TaxCard({ label, amount, hint }: { label: string; amount: number; hint: string }) {
  return (
    <div
      style={{
        padding: 20,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: amount > 0 ? 'var(--accent-primary)' : 'var(--text-muted)', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
        {formatCurrency(amount)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
        {hint}
      </div>
    </div>
  );
}

function Row({ label, value, highlight, bold }: { label: string; value: string; highlight?: boolean; bold?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        fontSize: bold ? 15 : 14,
        fontWeight: bold ? 700 : 400,
        color: highlight ? 'var(--accent-primary)' : 'var(--text-primary)',
        borderTop: bold ? '1px solid var(--border-subtle)' : 'none',
        paddingTop: bold ? 12 : 6,
        marginTop: bold ? 8 : 0,
      }}
    >
      <span>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}
