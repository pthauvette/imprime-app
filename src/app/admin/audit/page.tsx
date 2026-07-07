/**
 * /admin/audit — visualisation du journal admin (AdminAuditEvent +
 * WebhookEvent unifié).
 *
 * Filtres :
 *   ?source=admin  → uniquement actions admin (refund, cancel, etc.)
 *   ?source=webhook → uniquement webhooks Stripe/Sinalite
 *   ?source=all    → les 2 mélangés tri par date desc (default)
 *   ?kind=ADMIN_MANUAL_REFUND → filtre par type d'event
 *   ?adminId=... → toutes les actions d'un admin spécifique
 *
 * Pagination simple : ?page=N (50 par page). Pas de search full-text
 * pour MVP — admin peut filter par kind ou exporter.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Journal audit' };

const PAGE_SIZE = 50;

type Source = 'all' | 'admin' | 'webhook';

interface UnifiedEvent {
  id: string;
  kind: string; // ADMIN_* ou eventType pour webhooks
  createdAt: Date;
  source: 'admin' | 'webhook';
  // Admin-specific
  adminEmail?: string;
  targetType?: string | null;
  targetId?: string | null;
  data?: string | null;
  // Webhook-specific
  webhookSource?: string; // STRIPE | SINALITE
  success?: boolean;
  statusCode?: number | null;
  latencyMs?: number | null;
  error?: string | null;
  orderId?: string | null;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; kind?: string; adminId?: string; page?: string }>;
}) {
  const { session } = await requireAdminPage();
  const sp = await searchParams;
  const source: Source = (['admin', 'webhook'].includes(sp.source ?? '') ? sp.source : 'all') as Source;
  const kindFilter = sp.kind ?? null;
  const adminIdFilter = sp.adminId ?? null;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const [adminEvents, webhookEvents, ordersCount, usersCount, kindGroups] = await Promise.all([
    source === 'webhook' ? Promise.resolve([]) :
      prisma.adminAuditEvent.findMany({
        where: {
          ...(kindFilter && { kind: kindFilter }),
          ...(adminIdFilter && { adminId: adminIdFilter }),
        },
        orderBy: { createdAt: 'desc' },
        take: source === 'admin' ? PAGE_SIZE : PAGE_SIZE,
        skip: source === 'admin' ? skip : 0,
      }),
    source === 'admin' ? Promise.resolve([]) :
      prisma.webhookEvent.findMany({
        orderBy: { processedAt: 'desc' },
        take: source === 'webhook' ? PAGE_SIZE : PAGE_SIZE,
        skip: source === 'webhook' ? skip : 0,
      }),
    prisma.order.count(),
    prisma.user.count(),
    prisma.adminAuditEvent.groupBy({
      by: ['kind'],
      _count: { _all: true },
      orderBy: { _count: { kind: 'desc' } },
      take: 12,
    }).catch(() => []),
  ]);

  // Merge + sort. Pour all: on prend les top 50 de chaque, on merge, on
  // re-sort, et on slice à 50. Pas parfait sur les très anciennes pages
  // (peut sauter des events) — mais MVP, l'admin filter par source pour
  // pagination précise.
  const unified: UnifiedEvent[] = [
    ...adminEvents.map((e): UnifiedEvent => ({
      id: e.id,
      kind: e.kind,
      createdAt: e.createdAt,
      source: 'admin',
      adminEmail: e.adminEmail,
      targetType: e.targetType,
      targetId: e.targetId,
      data: e.data,
    })),
    ...webhookEvents.map((e): UnifiedEvent => ({
      id: e.id,
      kind: e.eventType,
      createdAt: e.processedAt,
      source: 'webhook',
      webhookSource: e.source,
      success: e.success,
      statusCode: e.statusCode,
      latencyMs: e.latencyMs,
      error: e.error,
      orderId: e.orderId,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, PAGE_SIZE);

  const SOURCE_TABS: { key: Source; label: string }[] = [
    { key: 'all', label: 'Tous' },
    { key: 'admin', label: 'Actions admin' },
    { key: 'webhook', label: 'Webhooks' },
  ];

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="audit"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Journal d&apos;audit</h1>
            <p className="adm-page-subtitle">
              Actions admin + webhooks Stripe/Sinalite. Append-only, jamais effacé.
            </p>
          </div>
        </header>

        {/* Source tabs */}
        <section style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          {SOURCE_TABS.map((tab) => {
            const active = source === tab.key;
            return (
              <a
                key={tab.key}
                href={tab.key === 'all' ? '/admin/audit' : `/admin/audit?source=${tab.key}`}
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
                }}
              >
                {tab.label}
              </a>
            );
          })}
        </section>

        {/* Kind pills (only for admin source) */}
        {source !== 'webhook' && kindGroups.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {kindFilter && (
              <a
                href={source === 'admin' ? '/admin/audit?source=admin' : '/admin/audit'}
                style={{
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  background: 'var(--bg-sunken)',
                  borderRadius: 'var(--r-pill)',
                  textDecoration: 'none',
                  color: 'var(--text-muted)',
                }}
              >
                ✕ Tous les types
              </a>
            )}
            {kindGroups.map((k) => {
              const active = kindFilter === k.kind;
              const params = new URLSearchParams();
              if (source === 'admin') params.set('source', 'admin');
              params.set('kind', k.kind);
              return (
                <a
                  key={k.kind}
                  href={`/admin/audit?${params.toString()}`}
                  style={{
                    padding: '4px 10px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    background: active ? 'var(--accent-primary)' : 'var(--bg-sunken)',
                    color: active ? 'var(--text-on-accent, #fff)' : 'var(--text-secondary)',
                    borderRadius: 'var(--r-pill)',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  {k.kind} <span style={{ opacity: 0.7 }}>{k._count._all}</span>
                </a>
              );
            })}
          </div>
        )}

        {/* Events table */}
        {unified.length === 0 ? (
          <div className="adm-panel" style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Aucun événement pour ce filtre.
          </div>
        ) : (
          <div className="adm-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--bg-sunken)' }}>
                <tr>
                  <th style={th}>Quand</th>
                  <th style={th}>Source</th>
                  <th style={th}>Type</th>
                  <th style={th}>Acteur</th>
                  <th style={th}>Cible</th>
                  <th style={th}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {unified.map((e) => (
                  <tr key={`${e.source}-${e.id}`} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDateTime(e.createdAt.toISOString())}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          padding: '2px 8px',
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.04em',
                          fontWeight: 600,
                          borderRadius: 4,
                          background: e.source === 'admin' ? 'var(--accent-soft)' : 'var(--info-soft)',
                          color: e.source === 'admin' ? 'var(--accent-primary)' : 'var(--info)',
                        }}
                      >
                        {e.source === 'admin' ? 'ADMIN' : e.webhookSource}
                      </span>
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.kind}</td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                      {e.adminEmail ?? '—'}
                    </td>
                    <td style={td}>
                      {e.targetType && e.targetId ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          {e.targetType.toLowerCase()} <Link href={resolveTargetLink(e.targetType, e.targetId) as Route} style={{ color: 'var(--accent-primary)' }}>{e.targetId.slice(-8)}</Link>
                        </span>
                      ) : e.orderId ? (
                        <Link href={`/admin/orders/${e.orderId}` as Route} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-primary)' }}>
                          order {e.orderId.slice(-8)}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      {e.source === 'webhook' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                          {e.success ? (
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ {e.statusCode ?? 200}</span>
                          ) : (
                            <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ {e.statusCode ?? 'fail'}</span>
                          )}
                          {e.latencyMs !== null && e.latencyMs !== undefined && (
                            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{e.latencyMs}ms</span>
                          )}
                        </span>
                      ) : (
                        e.data ? (
                          <DataPreview data={e.data} />
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination simple — uniquement quand on filtre par source précise */}
        {(source === 'admin' || source === 'webhook') && unified.length === PAGE_SIZE && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Page {page}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {page > 1 && (
                <a href={buildPageHref(source, kindFilter, page - 1)} style={pagerStyle}>← Précédent</a>
              )}
              <a href={buildPageHref(source, kindFilter, page + 1)} style={pagerStyle}>Suivant →</a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function buildPageHref(source: Source, kind: string | null, page: number): string {
  const params = new URLSearchParams();
  if (source !== 'all') params.set('source', source);
  if (kind) params.set('kind', kind);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/admin/audit${qs ? `?${qs}` : ''}`;
}

function resolveTargetLink(targetType: string, targetId: string): string {
  switch (targetType) {
    case 'ORDER':
      return `/admin/orders/${targetId}`;
    case 'USER':
      return `/admin/users`;
    case 'PROMO_CODE':
      return `/admin/promo-codes`;
    case 'PRODUCT':
      return `/admin/products`;
    case 'TEMPLATE':
      return `/admin/templates`;
    default:
      return '/admin/audit';
  }
}

/**
 * Affiche le JSON data en expansion <details> pour pas pollute la table.
 * Affiche les top-level keys en preview, plus le full JSON dans le panel.
 */
function DataPreview({ data }: { data: string }) {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(data) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{data.slice(0, 40)}</span>;
  }
  const keys = Object.keys(parsed);
  const preview = keys.slice(0, 3).map((k) => `${k}=${JSON.stringify(parsed![k]).slice(0, 20)}`).join(' · ');
  return (
    <details>
      <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
        {preview}{keys.length > 3 ? '…' : ''}
      </summary>
      <pre style={{ marginTop: 4, padding: 8, background: 'var(--bg-canvas)', fontSize: 10, fontFamily: 'var(--font-mono)', borderRadius: 4, overflow: 'auto', maxWidth: 360 }}>
        {JSON.stringify(parsed, null, 2)}
      </pre>
    </details>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  fontWeight: 600,
};
const td: React.CSSProperties = { padding: '10px 16px', verticalAlign: 'top' };
const pagerStyle: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-sm)',
  textDecoration: 'none',
  color: 'inherit',
};
