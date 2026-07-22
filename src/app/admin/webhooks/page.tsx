/**
 * /admin/webhooks — Event log webhook (Stripe + Sinalite).
 *
 * Server Component. Query WebhookEvent avec filtres source/type/search +
 * pagination. searchParams: ?source=STRIPE|SINALITE&type=foo&q=evt_…&page=1
 *
 * Outcome tracking : depuis la migration enrich_webhook_event, chaque row
 * WebhookEvent porte success/statusCode/latencyMs/error. Les handlers
 * Stripe et Sinalite patchent ces champs en fin de POST via
 * updateWebhookOutcome — donc les stats ci-dessous sont des vraies mesures
 * (pas des approximations). Les rows historiques pré-migration ont
 * success=true par défaut (cf default Prisma) — biais en faveur du succès
 * tant qu'on n'a pas backfillé.
 */

import Link from 'next/link';
import type { Route } from 'next';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { prisma } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin-auth';
import { getAdminSidebarCounts } from '@/lib/admin/sidebar-counts';
import { formatDateTime } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import ReplayButton from './ReplayButton';
import BulkReplayActions from './BulkReplayActions';

export const metadata = { title: 'Admin — Webhooks' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
type Source = 'STRIPE' | 'SINALITE';
const SOURCES: readonly Source[] = ['STRIPE', 'SINALITE'] as const;

interface SP {
  source?: string;
  type?: string;
  q?: string;
  page?: string;
  /** Round 16 #2 : filter by HTTP status — '2xx', '4xx', '5xx' */
  status?: string;
}

type StatusFilter = '2xx' | '4xx' | '5xx';
const STATUS_FILTERS: readonly StatusFilter[] = ['2xx', '4xx', '5xx'] as const;

export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { session } = await requireAdminPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const filterSource: Source | null = (SOURCES as readonly string[]).includes(sp.source ?? '')
    ? (sp.source as Source)
    : null;
  const filterType = (sp.type ?? '').trim();
  const search = (sp.q ?? '').trim();
  const filterStatus: StatusFilter | null = (STATUS_FILTERS as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as StatusFilter)
    : null;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const previous24h = new Date(now.getTime() - 48 * 3600 * 1000);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  // ─── WHERE clause for the listing ──────────────────────────────────────
  type WhWhere = NonNullable<NonNullable<Parameters<typeof prisma.webhookEvent.findMany>[0]>['where']>;
  // Round 16 #2 : statusCode tracking enabled. 2xx = success path,
  // 4xx = bad request (signature/payload), 5xx = server error.
  const statusWhere: WhWhere = filterStatus === '2xx'
    ? { statusCode: { gte: 200, lt: 300 } }
    : filterStatus === '4xx'
    ? { statusCode: { gte: 400, lt: 500 } }
    : filterStatus === '5xx'
    ? { statusCode: { gte: 500, lt: 600 } }
    : {};
  const where: WhWhere = {
    ...(filterSource ? { source: filterSource } : {}),
    ...(filterType ? { eventType: filterType } : {}),
    ...(search ? { eventId: { contains: search, mode: 'insensitive' as const } } : {}),
    ...statusWhere,
  };

  const [
    events,
    listTotal,
    sourceGroups,
    typeGroups,
    total24h,
    totalPrev24h,
    failed24h,
    success7dCount,
    total7dCount,
    latencyAgg7d,
    lastStripe,
    lastSinalite,
    stripe24hCount,
    sinalite24hCount,
    stripeFailed24h,
    sinaliteFailed24h,
    sidebarOrders,
    sidebarUsers,
  ] = await Promise.all([
    prisma.webhookEvent.findMany({
      where,
      orderBy: { processedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.webhookEvent.count({ where }),
    prisma.webhookEvent.groupBy({
      by: ['source'],
      _count: { _all: true },
    }),
    prisma.webhookEvent.groupBy({
      by: ['eventType'],
      _count: { _all: true },
      orderBy: { _count: { eventType: 'desc' } },
    }),
    prisma.webhookEvent.count({ where: { processedAt: { gte: yesterday } } }),
    prisma.webhookEvent.count({
      where: { processedAt: { gte: previous24h, lt: yesterday } },
    }),
    prisma.webhookEvent.count({
      where: { success: false, processedAt: { gte: yesterday } },
    }),
    prisma.webhookEvent.count({
      where: { success: true, processedAt: { gte: lastWeek } },
    }),
    prisma.webhookEvent.count({
      where: { processedAt: { gte: lastWeek } },
    }),
    prisma.webhookEvent.aggregate({
      where: { processedAt: { gte: lastWeek }, latencyMs: { not: null } },
      _avg: { latencyMs: true },
    }),
    prisma.webhookEvent.findFirst({
      where: { source: 'STRIPE', success: true },
      orderBy: { processedAt: 'desc' },
    }),
    prisma.webhookEvent.findFirst({
      where: { source: 'SINALITE', success: true },
      orderBy: { processedAt: 'desc' },
    }),
    prisma.webhookEvent.count({
      where: { source: 'STRIPE', processedAt: { gte: yesterday } },
    }),
    prisma.webhookEvent.count({
      where: { source: 'SINALITE', processedAt: { gte: yesterday } },
    }),
    prisma.webhookEvent.count({
      where: { source: 'STRIPE', success: false, processedAt: { gte: yesterday } },
    }),
    prisma.webhookEvent.count({
      where: { source: 'SINALITE', success: false, processedAt: { gte: yesterday } },
    }),
    prisma.order.count(),
    prisma.user.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));
  const allEventsCount = sourceGroups.reduce((a, c) => a + c._count._all, 0);

  // ─── Aggregates ─────────────────────────────────────────────────────────
  // Success rate over 7d for a meaningful sample. If we have zero events
  // in the window, show "—" rather than a misleading 100%.
  const successRate7d = total7dCount > 0
    ? Math.round((success7dCount / total7dCount) * 1000) / 10 // one decimal
    : null;
  const avgLatencyMs = latencyAgg7d._avg.latencyMs !== null
    ? Math.round(latencyAgg7d._avg.latencyMs)
    : null;

  const countBySource = (s: Source | null): number => {
    if (s === null) return allEventsCount;
    return sourceGroups.find((g) => g.source === s)?._count._all ?? 0;
  };

  const delta24h = totalPrev24h > 0
    ? Math.round(((total24h - totalPrev24h) / totalPrev24h) * 100)
    : null;

  // Round 15 #3 : counts dynamiques via helper centralisé.
  const sidebarCountsBase = await getAdminSidebarCounts();
  const sidebarCounts = {
    ...sidebarCountsBase,
    orders: sidebarOrders,
    webhooks: allEventsCount,
    users: sidebarUsers,
  };

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="webhooks"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Webhooks</h1>
            <p className="adm-page-subtitle">
              {allEventsCount} events traités · {total24h} dernières 24 h
            </p>
          </div>
          {/* Round 14 #5 : "⚡ Test endpoint" disabled button retiré.
              Re-add quand on aura un real "send sample event" workflow
              (e.g. POST to /api/webhooks/stripe avec un event simulé). */}
        </header>

        {/* ─── Health stats ──────────────────────────────────────── */}
        <section className="adm-health">
          <div className="adm-health-card">
            <div className="adm-health-label">Événements · 24 h</div>
            <div className="adm-health-value">{total24h}</div>
            <div className={delta24h !== null && delta24h > 0 ? 'adm-health-meta up' : 'adm-health-meta'}>
              {delta24h !== null
                ? `${delta24h >= 0 ? '↑' : '↓'} ${Math.abs(delta24h)} % vs hier`
                : '— vs hier'}
            </div>
          </div>
          <div className="adm-health-card">
            <div className="adm-health-label">Taux de succès</div>
            <div className="adm-health-value">
              {successRate7d !== null ? successRate7d : '—'}<span className="unit">%</span>
            </div>
            <div className="adm-health-meta">
              {total7dCount > 0
                ? `${success7dCount}/${total7dCount} events · 7 j`
                : 'aucun event · 7 j'}
            </div>
          </div>
          <div className="adm-health-card">
            <div className="adm-health-label">Latence moyenne</div>
            <div className="adm-health-value">
              {avgLatencyMs !== null ? avgLatencyMs : '—'}<span className="unit">ms</span>
            </div>
            <div className="adm-health-meta">moyenne · 7 j</div>
          </div>
          <div className={failed24h > 0 ? 'adm-health-card danger' : 'adm-health-card'}>
            <div className="adm-health-label">Échecs · 24 h</div>
            <div className={failed24h > 0 ? 'adm-health-value danger' : 'adm-health-value'}>{failed24h}</div>
            <div className={failed24h > 0 ? 'adm-health-meta down' : 'adm-health-meta'}>
              {failed24h > 0 ? 'Webhooks en erreur · 24 h' : 'rien à signaler'}
            </div>
          </div>
        </section>

        {/* ─── Filter bar ────────────────────────────────────────── */}
        <div className="adm-filters">
          <div className="adm-filter-group">
            <span className="adm-filter-label">Source</span>
            <div className="adm-pills">
              {([null, 'STRIPE', 'SINALITE'] as (Source | null)[]).map((src) => {
                const label = src === null ? 'Tous' : src === 'STRIPE' ? 'Stripe' : 'Sinalite';
                const params = buildParams({ source: src, type: filterType, q: search });
                const href = `/admin/webhooks${params ? '?' + params : ''}`;
                const isActive = src === filterSource || (src === null && filterSource === null);
                return (
                  <Link
                    key={src ?? 'all'}
                    href={href as Route}
                    className={isActive ? 'active' : ''}
                  >
                    {label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{countBySource(src)}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <form action="/admin/webhooks" method="get" className="adm-filter-group">
            {filterSource && <input type="hidden" name="source" value={filterSource} />}
            {search && <input type="hidden" name="q" value={search} />}
            <span className="adm-filter-label" aria-hidden="true">Type</span>
            {/* Audit admin 2026-07 §6.4 — le span voisin n'était pas associé au
                select : aucun nom accessible pour les lecteurs d'écran. */}
            <select className="adm-select" name="type" defaultValue={filterType} aria-label="Filtrer par type d'événement">
              <option value="">Tous les events</option>
              {typeGroups.map((g) => (
                <option key={g.eventType} value={g.eventType}>
                  {g.eventType} ({g._count._all})
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }}>Filtrer</button>
          </form>

          {/* Round 16 #2 : status filter pills réactivées (statusCode était
              déjà tracké dans WebhookEvent — le commentaire Round 14 était
              incorrect). 2xx/4xx/5xx → range query sur statusCode. */}
          <div className="adm-filter-group">
            <span className="adm-filter-label">Statut</span>
            <div className="adm-pills">
              <a
                href={`/admin/webhooks${buildFilterQS({ source: filterSource, type: filterType, q: search, status: null })}`}
                className={filterStatus === null ? 'active' : ''}
                style={{ textDecoration: 'none' }}
              >
                Tous
              </a>
              {(['2xx', '4xx', '5xx'] as const).map((s) => (
                <a
                  key={s}
                  href={`/admin/webhooks${buildFilterQS({ source: filterSource, type: filterType, q: search, status: s })}`}
                  className={filterStatus === s ? 'active' : ''}
                  style={{ textDecoration: 'none' }}
                  title={
                    s === '2xx' ? 'Success (200-299)' :
                    s === '4xx' ? 'Bad request / unauthorized (400-499)' :
                    'Server error (500-599)'
                  }
                >
                  {s === '2xx' ? <><Icon name="check" size={14} /> 2xx</> : s === '4xx' ? <><Icon name="alert" size={14} /> 4xx</> : <><Icon name="x" size={14} /> 5xx</>}
                </a>
              ))}
            </div>
          </div>

          <form action="/admin/webhooks" method="get" style={{ marginLeft: 'auto' }}>
            {filterSource && <input type="hidden" name="source" value={filterSource} />}
            {filterType && <input type="hidden" name="type" value={filterType} />}
            {filterStatus && <input type="hidden" name="status" value={filterStatus} />}
            <input
              className="adm-search-input"
              name="q"
              defaultValue={search}
              placeholder="Cherche par event ID, e.g. evt_3NaB2gK…"
            />
          </form>
        </div>

        {/* ─── Main webhooks table ──────────────────────────────── */}
        <section className="adm-panel" style={{ marginBottom: 24 }}>
          {events.length === 0 ? (
            <EmptyState />
          ) : (
            <table className="adm-wh-table">
              <thead>
                <tr>
                  {/* Round 20 #2 : checkbox bulk-select wired via BulkReplayActions client */}
                  <th scope="col" style={{ width: 32 }}>
                    <input type="checkbox" data-webhook-select-all aria-label="Sélectionner tout" />
                  </th>
                  <th scope="col" style={{ width: 170 }}>Timestamp</th>
                  <th scope="col" style={{ width: 90 }}>Source</th>
                  <th scope="col">Event type</th>
                  <th scope="col" style={{ width: 240 }}>Event ID</th>
                  <th scope="col" style={{ width: 100 }}>Status</th>
                  <th scope="col" style={{ width: 90 }}>Latence</th>
                  <th scope="col" style={{ width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <input type="checkbox" data-webhook-id={e.id} aria-label={`Sélectionner ${e.eventId}`} />
                    </td>
                    <td>
                      <span className="adm-wh-time">
                        {formatDateTime(e.processedAt.toISOString())}
                      </span>
                    </td>
                    <td>
                      <span className={`adm-wh-source ${e.source === 'STRIPE' ? 'stripe' : 'sinalite'}`}>
                        {e.source === 'STRIPE' ? 'Stripe' : 'Sinalite'}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/admin/webhooks/${e.id}` as Route}
                        className="adm-wh-evt"
                        title="Voir détail + payload + diff"
                        style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {e.eventType}
                      </Link>
                    </td>
                    <td><span className="adm-wh-ref" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{e.eventId}</span></td>
                    <td>
                      <StatusCell
                        success={e.success}
                        statusCode={e.statusCode}
                        error={e.error}
                      />
                    </td>
                    <td>
                      <LatencyCell latencyMs={e.latencyMs} />
                    </td>
                    <td>
                      <div className="adm-wh-actions">
                        <ReplayButton
                          id={e.id}
                          hasPayload={e.payload !== null}
                          source={e.source}
                          eventType={e.eventType}
                          replayCount={e.replayCount}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Round 20 #2 — Bulk replay actions (sticky bar quand selection > 0) */}
          {events.length > 0 && <BulkReplayActions eventIds={events.map((e) => e.id)} />}

          {listTotal > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={listTotal}
              source={filterSource}
              type={filterType}
              search={search}
            />
          )}
        </section>

        {/* ─── Endpoints configurés ─────────────────────────────── */}
        <section className="adm-panel">
          <div className="adm-panel-header">
            <h2 className="adm-panel-title">
              Endpoints configurés
              <span className="adm-panel-title-meta">2 actifs · signatures vérifiées</span>
            </h2>
          </div>
          <div>
            <div className="adm-endpoint-row">
              <div>
                <div className="adm-endpoint-name">
                  <span className="adm-wh-source stripe">Stripe</span>
                  Production endpoint
                  <span className="badge badge-success">Active</span>
                </div>
                <span className="adm-endpoint-url">https://www.plio.ca/api/webhooks/stripe</span>
              </div>
              <div className="adm-endpoint-last">
                Dernier succès<br/>
                <strong>{lastStripe ? formatDateTime(lastStripe.processedAt.toISOString()) : '—'}</strong>
                {' · '}{stripe24hCount} events / 24 h
                {stripeFailed24h > 0 && (
                  <> · <span style={{ color: 'var(--color-danger, #c0392b)' }}>{stripeFailed24h} échec{stripeFailed24h > 1 ? 's' : ''}</span></>
                )}
              </div>
              {/* Round 14 #5 : bulk "Replay 24 h" disabled retiré. Per-event
                  replay marche via ReplayButton dans la list ci-dessous —
                  c'est la seule path supportée pour l'instant. */}
            </div>
            <div className="adm-endpoint-row">
              <div>
                <div className="adm-endpoint-name">
                  <span className="adm-wh-source sinalite">Sinalite</span>
                  Status callback
                  <span className={`badge ${sinaliteFailed24h > 0 ? 'badge-warning' : 'badge-success'}`}>
                    {sinaliteFailed24h > 0 ? 'Dégradé' : 'Active'}
                  </span>
                </div>
                <span className="adm-endpoint-url">https://www.plio.ca/api/webhooks/sinalite</span>
              </div>
              <div className="adm-endpoint-last">
                Dernier succès<br/>
                <strong>{lastSinalite ? formatDateTime(lastSinalite.processedAt.toISOString()) : '—'}</strong>
                {' · '}{sinalite24hCount} events / 24 h
                {sinaliteFailed24h > 0 && (
                  <> · <span style={{ color: 'var(--color-danger, #c0392b)' }}>{sinaliteFailed24h} échec{sinaliteFailed24h > 1 ? 's' : ''}</span></>
                )}
              </div>
              {/* Round 14 #5 : "Replay failed" bulk disabled retiré (cf. ci-dessus). */}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildParams(opts: {
  source: Source | null;
  type: string;
  q: string;
  page?: number;
  status?: StatusFilter | null;
}): string {
  const params = new URLSearchParams();
  if (opts.source) params.set('source', opts.source);
  if (opts.type) params.set('type', opts.type);
  if (opts.q) params.set('q', opts.q);
  if (opts.status) params.set('status', opts.status);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  return params.toString();
}

/** Round 16 #2 : QS builder pour les status filter pills. Préserve les
 *  autres filtres + supprime page (reset à 1 quand on change de filter). */
function buildFilterQS(opts: {
  source: Source | null;
  type: string;
  q: string;
  status: StatusFilter | null;
}): string {
  const qs = buildParams(opts);
  return qs ? `?${qs}` : '';
}

function StatusCell({
  success,
  statusCode,
  error,
}: {
  success: boolean;
  statusCode: number | null;
  error: string | null;
}) {
  // Categorize: 2xx green, 4xx yellow, 5xx (or success=false) red, unknown grey.
  const code = statusCode ?? (success ? 200 : 500);
  const klass = success && code < 400
    ? 's2xx'
    : code >= 400 && code < 500
      ? 's4xx'
      : 's5xx';
  const label = success && code < 400
    ? `${code} OK`
    : code >= 500
      ? `${code} ERR`
      : `${code}`;
  return (
    <span
      className={`adm-wh-status ${klass}`}
      title={error ?? undefined}
      style={!success && error ? { cursor: 'help' } : undefined}
    >
      {label}
    </span>
  );
}

function LatencyCell({ latencyMs }: { latencyMs: number | null }) {
  if (latencyMs === null) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }
  // Green <500ms, yellow 500-2000ms, red >2000ms.
  const color = latencyMs < 500
    ? 'var(--color-success, #16a34a)'
    : latencyMs <= 2000
      ? 'var(--color-warning, #d97706)'
      : 'var(--color-danger, #c0392b)';
  return (
    <span style={{ color, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
      {latencyMs} ms
    </span>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ marginBottom: 12 }}><Icon name="settings" size={44} /></div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 400 }}>
        Aucun webhook
      </h2>
      <p style={{ fontSize: 14, margin: 0 }}>
        Les events Stripe et Sinalite traités apparaîtront ici.
      </p>
    </div>
  );
}

function Pagination({
  page, totalPages, totalCount, source, type, search,
}: {
  page: number; totalPages: number; totalCount: number;
  source: Source | null; type: string; search: string;
}) {
  const buildHref = (p: number): Route => {
    const params = buildParams({ source, type, q: search, page: p });
    return `/admin/webhooks${params ? '?' + params : ''}` as Route;
  };

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="ord-pagination">
      <div className="ord-pagination-left">
        Affiché <strong>{from}–{to}</strong> sur <strong>{totalCount}</strong>
      </div>
      <div className="ord-pagination-right">
        {page > 1 ? (
          <Link href={buildHref(page - 1)} className="ord-pagination-btn">←</Link>
        ) : (
          <span className="ord-pagination-btn" style={{ opacity: 0.3 }}>←</span>
        )}
        <span className="ord-pagination-page">
          Page <strong>{page}</strong> sur {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={buildHref(page + 1)} className="ord-pagination-btn">→</Link>
        ) : (
          <span className="ord-pagination-btn" style={{ opacity: 0.3 }}>→</span>
        )}
      </div>
    </div>
  );
}
