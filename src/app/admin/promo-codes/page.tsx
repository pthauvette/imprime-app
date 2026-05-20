/**
 * /admin/promo-codes — liste des codes promo + form de création inline.
 *
 * Server Component pour la liste, sub-Client pour le form (besoin de state).
 * Toggle active inline via PATCH /api/admin/promo-codes/[id] — refresh page.
 */

import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatDate } from '@/lib/format';
import PromoCreateForm from './PromoCreateForm';
import PromoToggleButton from './PromoToggleButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Codes promo · Plio' };

function cad(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',') + ' $';
}

export default async function AdminPromoCodesPage() {
  const { session } = await requireAdminPage();

  const [codes, totalOrders, totalUsers] = await Promise.all([
    prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { _count: { select: { orders: true } } },
    }),
    prisma.order.count(),
    prisma.user.count(),
  ]);

  const activeCount = codes.filter((c) => c.active).length;

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="promo-codes"
        counts={{ orders: totalOrders, users: totalUsers, 'promo-codes': activeCount }}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Codes promo</h1>
            <p className="adm-page-subtitle">
              {codes.length} code{codes.length > 1 ? 's' : ''} créé{codes.length > 1 ? 's' : ''} · {activeCount} actif{activeCount > 1 ? 's' : ''} · appliqués au checkout `/order/review`
            </p>
          </div>
        </header>

        <section className="adm-panel" style={{ marginBottom: 24 }}>
          <div className="adm-panel-header">
            <h2 className="adm-panel-title">Créer un nouveau code</h2>
          </div>
          <div style={{ padding: 22 }}>
            <PromoCreateForm />
          </div>
        </section>

        <section className="adm-panel">
          <div className="adm-panel-header">
            <h2 className="adm-panel-title">
              Codes existants
              <span className="adm-panel-title-meta">{codes.length}</span>
            </h2>
          </div>
          {codes.length === 0 ? (
            <div style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Aucun code créé. Ton premier code apparaîtra ici.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={th}>Code</th>
                  <th style={th}>Rabais</th>
                  <th style={th}>Restrictions</th>
                  <th style={th}>Utilisations</th>
                  <th style={th}>Créé</th>
                  <th style={{ ...th, textAlign: 'right' }}>État</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={td}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{c.code}</div>
                      {c.label && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>}
                    </td>
                    <td style={td}>
                      {c.discountPct !== null
                        ? <span style={{ fontFamily: 'var(--font-mono)' }}>{c.discountPct} %</span>
                        : c.discountCents !== null
                          ? <span style={{ fontFamily: 'var(--font-mono)' }}>{cad(c.discountCents)}</span>
                          : <span style={{ color: 'var(--danger)' }}>—</span>}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>
                      {[
                        c.expiresAt && `expire ${formatDate(c.expiresAt.toISOString())}`,
                        c.minSubtotalCents && `min ${cad(c.minSubtotalCents)}`,
                        c.maxUses && `max ${c.maxUses}`,
                        c.firstOrderOnly && '1ère commande only',
                      ].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={td}>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>
                        {c.usesCount}{c.maxUses ? ` / ${c.maxUses}` : ''}
                      </span>
                      {c._count.orders > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
                          ({c._count.orders} cmd)
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, color: 'var(--text-muted)', fontSize: 11 }}>
                      {formatDate(c.createdAt.toISOString())}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <PromoToggleButton id={c.id} active={c.active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'top',
};
