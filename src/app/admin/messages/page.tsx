/**
 * /admin/messages — inbox des contacts customer (ContactMessage).
 *
 * Tabs par status (OPEN par défaut). Pour chaque message :
 *  - From + subject + body
 *  - Lien mailto reply-to direct
 *  - Actions : Mark answered / Close / + Note
 *  - Si orderId détecté : lien vers /admin/orders/[id]
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import type { Route } from 'next';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatDateTime } from '@/lib/format';
import MessageActions from './MessageActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Messages · Plio' };

const STATUS_TABS = [
  { key: 'OPEN', label: 'Ouverts', urgent: true },
  { key: 'ANSWERED', label: 'Répondus' },
  { key: 'CLOSED', label: 'Fermés' },
];

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  const { status: statusParam } = await searchParams;
  const filter = STATUS_TABS.some((t) => t.key === statusParam) ? statusParam! : 'OPEN';

  const [messages, counts, ordersCount, usersCount] = await Promise.all([
    prisma.contactMessage.findMany({
      where: { status: filter },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.contactMessage.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.order.count(),
    prisma.user.count(),
  ]);

  const countByStatus = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const openCount = countByStatus('OPEN');

  return (
    <div className="adm-shell">
      <AdminSidebar
        active={'messages' as never}
        counts={{ orders: ordersCount, users: usersCount }}
        urgents={{ messages: openCount > 0 } as never}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Messages clients</h1>
            <p className="adm-page-subtitle">
              <strong style={{ color: openCount > 0 ? 'var(--warning, #D97706)' : undefined }}>
                {openCount} ouvert{openCount > 1 ? 's' : ''}
              </strong>
              {' · '}{countByStatus('ANSWERED')} répondus · {countByStatus('CLOSED')} fermés
            </p>
          </div>
        </header>

        <section style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          {STATUS_TABS.map((tab) => {
            const active = filter === tab.key;
            const count = countByStatus(tab.key);
            return (
              <a
                key={tab.key}
                href={`/admin/messages?status=${tab.key}`}
                style={{
                  padding: '8px 14px',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: active ? 'var(--accent-primary)' : 'var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                {tab.label}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: tab.urgent && count > 0 ? 'var(--warning, #D97706)' : 'inherit' }}>
                  {count}
                </span>
              </a>
            );
          })}
        </section>

        {messages.length === 0 ? (
          <div className="adm-panel" style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Aucun message pour ce filtre.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {messages.map((m) => (
              <div key={m.id} className="adm-panel" style={{ padding: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{m.name}</strong>
                    <a href={`mailto:${m.email}`} style={{ marginLeft: 10, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontSize: 12, textDecoration: 'none' }}>
                      {m.email}
                    </a>
                    {m.source && (
                      <span style={{ marginLeft: 10, padding: '2px 8px', background: 'var(--bg-sunken)', color: 'var(--text-muted)', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {m.source}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {formatDateTime(m.createdAt.toISOString())}
                  </div>
                </div>

                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                  {m.subject}
                </div>

                <div style={{ padding: 14, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                  {m.message}
                </div>

                {m.orderId && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    Lié à : <Link href={`/admin/orders/${m.orderId}` as Route} style={{ color: 'var(--accent-primary)' }}>order {m.orderId.slice(-8)}</Link>
                  </div>
                )}

                {m.adminNotes && (
                  <div style={{ padding: 10, background: 'var(--bg-canvas)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    <strong>Note admin :</strong> {m.adminNotes}
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <a href={`mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject)}`} className="btn btn-primary btn-sm">
                    ✉ Répondre
                  </a>
                  <MessageActions id={m.id} status={m.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
