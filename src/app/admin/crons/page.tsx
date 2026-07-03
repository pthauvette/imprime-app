/**
 * /admin/crons — Dashboard interne des cron jobs.
 *
 * Pour chaque cron connu (cleanup, daily-summary, email-retry,
 * re-engagement) :
 *   - Dernier run (timestamp + status)
 *   - Success rate sur les 7 derniers jours
 *   - Latence avg sur 7d
 *   - Dernier message d'erreur si fail
 *
 * Plus une table des 50 dernières runs tous crons confondus pour
 * diagnostic rapide (pattern de fails consécutifs, latence qui dérive).
 *
 * Healthchecks.io complète : ce dashboard est lecture seule + insight
 * temps réel ; Healthchecks fait l'alerting timeout.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import type { CSSProperties } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { findStuckCarts } from '@/lib/cron/stuck-carts';

export const metadata = { title: 'Admin — Cron monitor' };
export const dynamic = 'force-dynamic';

/**
 * Round 29 #1 — KNOWN_CRONS sync avec .github/workflows/cron-*.yml.
 * Expected interval (ms) sert au freshness check : si dernier run est
 * > 2.5× l'interval, on flag stale (laisse de la marge pour scheduler
 * lag GH Actions qui peut être ±5min sur un cron horaire).
 */
const CRONS: ReadonlyArray<{ name: string; expectedIntervalMs: number; label: string }> = [
  { name: 'cleanup',                  expectedIntervalMs: 24 * 3600 * 1000,    label: 'quotidien 3h UTC' },
  { name: 'daily-summary',            expectedIntervalMs: 24 * 3600 * 1000,    label: 'quotidien 13h UTC (9h EDT/8h EST)' },
  { name: 'email-retry',              expectedIntervalMs: 5 * 60 * 1000,       label: 'toutes les 5 min' },
  { name: 're-engagement',            expectedIntervalMs: 24 * 3600 * 1000,    label: 'quotidien 8h UTC' },
  { name: 'abandoned-cart',           expectedIntervalMs: 6 * 3600 * 1000,     label: 'toutes les 6 h' },
  { name: 'loyalty-tiers',            expectedIntervalMs: 30 * 24 * 3600 * 1000, label: 'mensuel 1er 5h UTC' },
  { name: 'wallet-expiry',            expectedIntervalMs: 24 * 3600 * 1000,    label: 'quotidien 6h UTC' },
  { name: 'broadcasts',               expectedIntervalMs: 5 * 60 * 1000,       label: 'toutes les 5 min' },
  { name: 'reseller-detection',       expectedIntervalMs: 30 * 24 * 3600 * 1000, label: 'mensuel 1er 7h UTC' },
  { name: 'reseller-monthly-stats',   expectedIntervalMs: 30 * 24 * 3600 * 1000, label: 'mensuel 1er 8h UTC' },
  { name: 'webhook-deadletter-alert', expectedIntervalMs: 2 * 3600 * 1000,     label: 'toutes les 2 h' },
  { name: 'stripe-clock-skew',        expectedIntervalMs: 6 * 3600 * 1000,     label: 'toutes les 6 h' },
  { name: 'sinalite-latency',         expectedIntervalMs: 15 * 60 * 1000,      label: 'toutes les 15 min' },
  { name: 'purge-old-events',         expectedIntervalMs: 30 * 24 * 3600 * 1000, label: 'mensuel 1er 9h UTC' },
  { name: 'admin-weekly-digest',      expectedIntervalMs: 7 * 24 * 3600 * 1000,  label: 'mercredi 13h UTC (9h EDT/8h EST)' },
  { name: 'order-sla-alerts',         expectedIntervalMs: 24 * 3600 * 1000,    label: 'quotidien 13h UTC (9h EDT/8h EST)' },
  { name: 'pipeda-sla-alerts',        expectedIntervalMs: 24 * 3600 * 1000,    label: 'quotidien 13h UTC (PIPEDA 30j SLA)' },
  { name: 'restore-compensation',     expectedIntervalMs: 60 * 60 * 1000,      label: 'toutes les heures (compensation crédit wallet/referral)' },
];
const KNOWN_CRONS = CRONS.map((c) => c.name);
type CronName = string;

/** Nearest-rank quantile (Round 25 #3 / 27 #4 pattern, inlined here). */
function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1));
  return sorted[idx]!;
}

export default async function AdminCronsPage() {
  const { session } = await requireAdminPage();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    redirect('/sign-in?callbackUrl=/admin/crons' as Route);
  }

  const cutoff7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [lastRunByName, statsBy7d, recentRuns, lastFailByName, latencySampleByName, stuckCarts] = await Promise.all([
    // Dernier run par cron name
    Promise.all(
      KNOWN_CRONS.map((name) =>
        prisma.cronRun.findFirst({
          where: { name },
          orderBy: { createdAt: 'desc' },
        }).then((r) => [name, r] as const),
      ),
    ),
    // Stats 7d par cron (success count + total + avg latency)
    prisma.cronRun.groupBy({
      by: ['name', 'status'],
      where: { createdAt: { gte: cutoff7d } },
      _count: { _all: true },
      _avg: { latencyMs: true },
    }),
    // Recent 50 runs tous crons confondus
    prisma.cronRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    // Last fail par cron pour montrer le dernier error message
    Promise.all(
      KNOWN_CRONS.map((name) =>
        prisma.cronRun.findFirst({
          where: { name, status: 'fail' },
          orderBy: { createdAt: 'desc' },
        }).then((r) => [name, r] as const),
      ),
    ),
    // Round 29 #1 — last 30 successful runs latency par cron pour P50/P95
    Promise.all(
      KNOWN_CRONS.map((name) =>
        prisma.cronRun.findMany({
          where: { name, status: 'success' },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { latencyMs: true },
        }).then((rows) => [name, rows.map((r) => r.latencyMs)] as const),
      ),
    ),
    // Round 46 — carts coincés (relance claimée mais jamais envoyée = silent loss)
    findStuckCarts(),
  ]);

  const lastRunMap = new Map(lastRunByName);
  const lastFailMap = new Map(lastFailByName);
  const latencyMap = new Map(latencySampleByName);
  const now = Date.now();

  // Aggregate stats par cron
  type CronStats7d = { success: number; fail: number; avgLatencyMs: number };
  const stats = new Map<string, CronStats7d>();
  for (const s of statsBy7d) {
    if (!stats.has(s.name)) stats.set(s.name, { success: 0, fail: 0, avgLatencyMs: 0 });
    const cur = stats.get(s.name)!;
    if (s.status === 'success') {
      cur.success = s._count._all;
      cur.avgLatencyMs = Math.round(s._avg.latencyMs ?? 0);
    } else if (s.status === 'fail') {
      cur.fail = s._count._all;
    }
  }

  const stuckTh: CSSProperties = {
    padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11,
    letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600,
  };
  const stuckTd: CSSProperties = { padding: '10px 14px', color: 'var(--text-primary)' };
  const recoverableCount = stuckCarts.filter((c) => c.recoverable).length;

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="crons"
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? '',
          role: session.user.role ?? 'USER',
        }}
      />

      <main className="adm-main" style={{ padding: '40px 48px 80px' }}>
        <header style={{ marginBottom: 32 }}>
          <div className="page-eyebrow">Système</div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 40,
              letterSpacing: '-0.025em',
              fontWeight: 400,
              margin: '8px 0 8px',
            }}
          >
            Cron monitor
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Last run + success rate 7 j + latence avg pour chaque cron.
            Healthchecks.io fait l&apos;alerting timeout externe en parallèle.
          </p>
        </header>

        <section style={{ display: 'grid', gap: 16, marginBottom: 32 }}>
          {CRONS.map((cron) => {
            const lastRun = lastRunMap.get(cron.name) ?? null;
            const latencies = latencyMap.get(cron.name) ?? [];
            // Round 29 #1 — freshness : si pas de run récent, on flag stale.
            // Threshold = 2.5× l'interval pour laisser de la marge à GH Actions
            // scheduler lag (peut être ±5min sur cron horaire).
            const ageMs = lastRun ? now - lastRun.createdAt.getTime() : null;
            const staleness = ageMs !== null && ageMs > cron.expectedIntervalMs * 2.5
              ? { ageMs, expectedMs: cron.expectedIntervalMs }
              : null;
            return (
              <CronCard
                key={cron.name}
                name={cron.name}
                schedule={cron.label}
                lastRun={lastRun}
                stats7d={stats.get(cron.name) ?? { success: 0, fail: 0, avgLatencyMs: 0 }}
                lastFail={lastFailMap.get(cron.name) ?? null}
                p50={quantile(latencies, 0.5)}
                p95={quantile(latencies, 0.95)}
                latencySampleSize={latencies.length}
                staleness={staleness}
              />
            );
          })}
        </section>

        {/* Round 46 — Carts coincés : relance claimée (emailSentAt set) mais
            JAMAIS envoyée (aucune EmailDelivery), hors review / converti /
            supprimé = silent loss. Récupérables (<72h) : débloquer via
            UPDATE "AbandonedCart" SET "emailSentAt"=NULL WHERE id='…' */}
        <section style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '0 0 12px',
            }}
          >
            Carts coincés — relance perdue ({stuckCarts.length})
          </h2>
          {stuckCarts.length === 0 ? (
            <div
              style={{
                padding: 20, fontSize: 13, color: 'var(--text-secondary)',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)',
              }}
            >
              ✓ Aucun cart coincé sur les 30 derniers jours.
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
                Relances claimées mais jamais envoyées (hors review / converti / supprimé).{' '}
                <strong>{recoverableCount} récupérable(s)</strong> (&lt;72&nbsp;h) — reset{' '}
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>emailSentAt=NULL</code> pour les ré-éligibiliser.
              </p>
              <div
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-lg)', overflow: 'hidden',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: 'var(--bg-sunken)' }}>
                    <tr style={{ textAlign: 'left' }}>
                      <th style={stuckTh}>Email</th>
                      <th style={stuckTh}>Étape</th>
                      <th style={stuckTh}>Abandonné</th>
                      <th style={stuckTh}>Claimé le</th>
                      <th style={stuckTh}>État</th>
                      <th style={stuckTh}>Cart ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stuckCarts.map((c) => (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td style={stuckTd}>{c.email}</td>
                        <td style={stuckTd}>{c.lastStep}</td>
                        <td style={stuckTd}>{Math.round(c.hoursSinceAbandon)}&nbsp;h</td>
                        <td style={stuckTd}>{formatDateTime(c.emailSentAt)}</td>
                        <td style={stuckTd}>
                          <span
                            style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                              background: c.recoverable ? 'var(--success-soft, #E7F5EC)' : 'var(--bg-sunken)',
                              color: c.recoverable ? 'var(--success, #1F7A3D)' : 'var(--text-muted)',
                            }}
                          >
                            {c.recoverable ? 'récupérable' : 'expiré'}
                          </span>
                        </td>
                        <td style={{ ...stuckTd, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{c.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section>
          <h2
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              fontWeight: 600,
              margin: '0 0 12px',
            }}
          >
            50 derniers runs (tous crons)
          </h2>
          {recentRuns.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                color: 'var(--text-muted)',
                background: 'var(--bg-surface)',
                border: '1px dashed var(--border-default)',
                borderRadius: 'var(--r-lg)',
              }}
            >
              Aucun run enregistré encore.
            </div>
          ) : (
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-lg)',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--bg-sunken)' }}>
                  <tr style={{ textAlign: 'left' }}>
                    <Th>When</Th>
                    <Th>Cron</Th>
                    <Th>Status</Th>
                    <Th>Latence</Th>
                    <Th>Error / Data</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <Td mono small>{formatDateTime(r.createdAt)}</Td>
                      <Td mono>{r.name}</Td>
                      <Td>
                        <StatusPill status={r.status} />
                      </Td>
                      <Td mono small>{r.latencyMs} ms</Td>
                      <Td small>
                        {r.errorMessage ? (
                          <span style={{ color: 'var(--danger, #dc2626)' }}>{r.errorMessage}</span>
                        ) : r.data ? (
                          <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{truncate(r.data, 80)}</code>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function CronCard({
  name,
  schedule,
  lastRun,
  stats7d,
  lastFail,
  p50,
  p95,
  latencySampleSize,
  staleness,
}: {
  name: CronName;
  schedule: string;
  lastRun: { status: string; latencyMs: number; createdAt: Date; errorMessage: string | null; data: string | null } | null;
  stats7d: { success: number; fail: number; avgLatencyMs: number };
  lastFail: { errorMessage: string | null; createdAt: Date } | null;
  p50: number | null;
  p95: number | null;
  latencySampleSize: number;
  staleness: { ageMs: number; expectedMs: number } | null;
}) {
  const total7d = stats7d.success + stats7d.fail;
  const successRate = total7d > 0 ? Math.round((stats7d.success / total7d) * 100) : null;

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${staleness ? 'var(--warning, #D97706)' : 'var(--border-subtle)'}`,
        borderLeft: staleness ? '4px solid var(--warning, #D97706)' : '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
        padding: 20,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
              fontWeight: 600,
              marginBottom: 2,
            }}
          >
            CRON · {schedule}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {name}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {staleness && (
            <span
              title={`Stale : aucun run depuis ${formatDuration(staleness.ageMs)}, interval attendu ${formatDuration(staleness.expectedMs)}`}
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                background: 'var(--warning, #D97706)',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: 'var(--r-pill)',
                fontWeight: 700,
              }}
            >
              ⚠ STALE
            </span>
          )}
          {lastRun ? (
            <StatusPill status={lastRun.status} />
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>jamais run</span>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Mini
          label="Dernier run"
          value={lastRun ? formatDateTime(lastRun.createdAt) : '—'}
          small
        />
        <Mini
          label="Latence (dernier)"
          value={lastRun ? `${lastRun.latencyMs} ms` : '—'}
        />
        <Mini
          label="Success rate · 7 j"
          value={successRate === null ? '—' : `${successRate}% (${stats7d.success}/${total7d})`}
        />
        <Mini
          label="Latence moy. · 7 j"
          value={stats7d.avgLatencyMs > 0 ? `${stats7d.avgLatencyMs} ms` : '—'}
        />
        {/* Round 29 #1 — P50/P95 sur 30 derniers runs success */}
        <Mini
          label={`P50 · ${latencySampleSize} runs`}
          value={p50 !== null ? `${p50} ms` : '—'}
        />
        <Mini
          label={`P95 · ${latencySampleSize} runs`}
          value={p95 !== null ? `${p95} ms` : '—'}
        />
      </div>

      {lastFail && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--danger-soft, #fef2f2)',
            border: '1px solid var(--danger, #dc2626)',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--danger, #dc2626)',
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Dernier fail · {formatDateTime(lastFail.createdAt)}
          </div>
          <code style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {lastFail.errorMessage ?? '(no message)'}
          </code>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const ok = status === 'success';
  return (
    <span
      style={{
        padding: '3px 10px',
        background: ok ? 'var(--success-soft, #f0fdf4)' : 'var(--danger-soft, #fef2f2)',
        color: ok ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)',
        borderRadius: 'var(--r-pill)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {ok ? '✓ success' : '✕ fail'}
    </span>
  );
}

function Mini({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: small ? 12 : 14, fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: '10px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        fontWeight: 600,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
  small,
}: {
  children: React.ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <td
      style={{
        padding: '10px 14px',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        fontSize: small ? 12 : 13,
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </td>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

/** Round 29 #1 — human-readable duration pour le staleness badge tooltip. */
function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} h`;
  const days = Math.round(hr / 24);
  return `${days} j`;
}
