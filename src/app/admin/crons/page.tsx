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
import AdminSidebar from '@/components/admin/AdminSidebar';
import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/format';

export const metadata = { title: 'Admin — Cron monitor' };
export const dynamic = 'force-dynamic';

const KNOWN_CRONS = ['cleanup', 'daily-summary', 'email-retry', 're-engagement', 'abandoned-cart', 'loyalty-tiers', 'wallet-expiry', 'broadcasts', 'reseller-detection'] as const;
type CronName = (typeof KNOWN_CRONS)[number];

export default async function AdminCronsPage() {
  const { session } = await requireAdminPage();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    redirect('/sign-in?callbackUrl=/admin/crons' as Route);
  }

  const cutoff7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [lastRunByName, statsBy7d, recentRuns, lastFailByName] = await Promise.all([
    // Dernier run par cron name (utilise findFirst dans une boucle —
    // 4 queries seulement, ok)
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
  ]);

  const lastRunMap = new Map(lastRunByName);
  const lastFailMap = new Map(lastFailByName);

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
          {KNOWN_CRONS.map((name) => (
            <CronCard
              key={name}
              name={name}
              lastRun={lastRunMap.get(name) ?? null}
              stats7d={stats.get(name) ?? { success: 0, fail: 0, avgLatencyMs: 0 }}
              lastFail={lastFailMap.get(name) ?? null}
            />
          ))}
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
  lastRun,
  stats7d,
  lastFail,
}: {
  name: CronName;
  lastRun: { status: string; latencyMs: number; createdAt: Date; errorMessage: string | null; data: string | null } | null;
  stats7d: { success: number; fail: number; avgLatencyMs: number };
  lastFail: { errorMessage: string | null; createdAt: Date } | null;
}) {
  const total7d = stats7d.success + stats7d.fail;
  const successRate = total7d > 0 ? Math.round((stats7d.success / total7d) * 100) : null;

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
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
            CRON
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {name}
          </div>
        </div>
        {lastRun ? (
          <StatusPill status={lastRun.status} />
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>jamais run</span>
        )}
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
