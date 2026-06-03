/**
 * /admin/broadcast — Composer + historique des broadcasts.
 *
 * MVP : composer en haut, list des 20 derniers en bas. Pas de drafts pour
 * MVP (on peut ajouter quand on a un editor markdown plus poussé).
 */

import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatDateTime } from '@/lib/format';
import BroadcastComposer from './BroadcastComposer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Broadcasts' };

const SEGMENT_LABELS: Record<string, string> = {
  newsletter: 'Newsletter',
  customers: 'Clients',
  all: 'Tous',
  'tier-gold': 'Tier OR',
  'tier-silver': 'Tier ARGENT',
  'tier-bronze': 'Tier BRONZE',
  'inactive-90d': 'Inactifs 90 j+',
};

export default async function AdminBroadcastPage() {
  const { session } = await requireAdminPage();

  const [recentBroadcasts, ordersCount, usersCount] = await Promise.all([
    prisma.emailBroadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.order.count(),
    prisma.user.count(),
  ]);

  return (
    <div className="adm-shell">
      <AdminSidebar
        active={'broadcast' as never}
        counts={{ orders: ordersCount, users: usersCount }}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Broadcasts email</h1>
            <p className="adm-page-subtitle">
              Annonce, newsletter ou message ciblé à un segment d&apos;audience.
            </p>
          </div>
        </header>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, margin: '0 0 16px' }}>
            Composer
          </h2>
          <BroadcastComposer />
        </section>

        <section>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, margin: '0 0 16px' }}>
            Historique récent
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
              {recentBroadcasts.length} broadcast{recentBroadcasts.length > 1 ? 's' : ''}
            </span>
          </h2>

          {recentBroadcasts.length === 0 ? (
            <div className="adm-panel" style={{ padding: '32px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Aucun broadcast pour l&apos;instant. Compose ton premier ↑
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {recentBroadcasts.map((b) => (
                <div key={b.id} className="adm-panel" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div>
                      <strong style={{ fontSize: 15 }}>{b.subject}</strong>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                        {SEGMENT_LABELS[b.segment] ?? b.segment} · {b.recipientCount} destinataires
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {formatDateTime(b.createdAt.toISOString())} · {b.adminEmail}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden', position: 'relative' }}>
                    {b.body.slice(0, 240)}
                    {b.body.length > 240 && (
                      <span style={{ color: 'var(--text-muted)' }}>…</span>
                    )}
                  </div>
                  {b.notes && (
                    <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text-muted)' }}>
                      📝 {b.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
