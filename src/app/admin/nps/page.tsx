/**
 * /admin/nps — Dashboard NPS interne.
 *
 * Affiche :
 *   - NPS score global (% promoters - % detractors) sur 30j et all-time
 *   - Distribution histogramme 0-10
 *   - Liste des derniers commentaires avec score + lien vers l'order
 *
 * Pas de filtres pour MVP (period picker). Si volume monte → ajouter.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/format';

export const metadata = { title: 'Admin — NPS' };
export const dynamic = 'force-dynamic';

export default async function AdminNpsPage() {
  const { session } = await requireAdminPage();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    redirect('/sign-in?callbackUrl=/admin/nps' as Route);
  }

  const cutoff30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [allResponses, last30dResponses, recentWithComments] = await Promise.all([
    prisma.npsResponse.findMany({ select: { score: true } }),
    prisma.npsResponse.findMany({
      where: { createdAt: { gte: cutoff30d } },
      select: { score: true },
    }),
    prisma.npsResponse.findMany({
      where: { comment: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        orderId: true,
        score: true,
        comment: true,
        createdAt: true,
      },
    }),
  ]);

  const allTimeNps = computeNps(allResponses.map((r) => r.score));
  const last30dNps = computeNps(last30dResponses.map((r) => r.score));
  const histogram = buildHistogram(allResponses.map((r) => r.score));
  const maxBar = Math.max(1, ...histogram);

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="nps"
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? '',
          role: session.user.role ?? 'USER',
        }}
      />

      <main className="adm-main" style={{ padding: '40px 48px 80px' }}>
        <header style={{ marginBottom: 32 }}>
          <div className="page-eyebrow">Customer feedback</div>
          <h1 className="adm-page-title" style={{ margin: '8px 0 8px' }}>Net Promoter Score</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Promoter (9-10) − Detractor (0-6) sur le total des répondants.
            Range −100 à +100. Industry benchmark : SaaS B2B {'~'} 30, e-commerce {'~'} 40+.
          </p>
        </header>

        {/* Score cards */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 32,
          }}
        >
          <ScoreCard label="NPS · 30 derniers jours" score={last30dNps.score} count={last30dNps.total} />
          <ScoreCard label="NPS · all-time" score={allTimeNps.score} count={allTimeNps.total} />
          <BucketCard
            label="Distribution all-time"
            promoters={allTimeNps.promoters}
            passives={allTimeNps.passives}
            detractors={allTimeNps.detractors}
            total={allTimeNps.total}
          />
        </section>

        {/* Histogram */}
        <section style={{ marginBottom: 32 }}>
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
            Distribution des scores (all-time)
          </h2>
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-lg)',
              padding: 20,
              display: 'grid',
              // Round 30 #4 — min 28px + overflow-x pour rester tap-friendly mobile
              gridTemplateColumns: 'repeat(11, minmax(28px, 1fr))',
              gap: 4,
              alignItems: 'end',
              minHeight: 180,
              overflowX: 'auto',
            }}
          >
            {histogram.map((count, score) => {
              const heightPct = (count / maxBar) * 100;
              const tone = score <= 6 ? 'danger' : score <= 8 ? 'warning' : 'success';
              const color =
                tone === 'danger'
                  ? 'var(--danger, #dc2626)'
                  : tone === 'warning'
                    ? 'var(--warning, #D97706)'
                    : 'var(--success, #16a34a)';
              return (
                <div key={score} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: 160, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {count}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(2, heightPct)}%`,
                      background: color,
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {score}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent comments */}
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
            Commentaires récents ({recentWithComments.length})
          </h2>
          {recentWithComments.length === 0 ? (
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
              Aucun commentaire pour l&apos;instant.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {recentWithComments.map((r) => (
                <CommentCard key={r.id} response={r} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

interface NpsBuckets {
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  score: number;
}

function computeNps(scores: number[]): NpsBuckets {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const s of scores) {
    if (s >= 9) promoters++;
    else if (s >= 7) passives++;
    else detractors++;
  }
  const total = scores.length;
  const score =
    total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
  return { promoters, passives, detractors, total, score };
}

function buildHistogram(scores: number[]): number[] {
  const h = new Array(11).fill(0);
  for (const s of scores) {
    if (s >= 0 && s <= 10) h[s]++;
  }
  return h;
}

function ScoreCard({ label, score, count }: { label: string; score: number; count: number }) {
  const color =
    count === 0
      ? 'var(--text-muted)'
      : score >= 50
        ? 'var(--success, #16a34a)'
        : score >= 0
          ? 'var(--warning, #D97706)'
          : 'var(--danger, #dc2626)';
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
        padding: 20,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 48,
          letterSpacing: '-0.025em',
          color,
          fontWeight: 400,
          lineHeight: 1,
        }}
      >
        {count === 0 ? '—' : score > 0 ? `+${score}` : String(score)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
        {count} réponse{count !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function BucketCard({
  label,
  promoters,
  passives,
  detractors,
  total,
}: Omit<NpsBuckets, 'score'> & { label: string }) {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
        padding: 20,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <BucketRow color="var(--success, #16a34a)" label="Promoters (9-10)" count={promoters} pct={pct(promoters)} />
        <BucketRow color="var(--warning, #D97706)" label="Passives (7-8)" count={passives} pct={pct(passives)} />
        <BucketRow color="var(--danger, #dc2626)" label="Detractors (0-6)" count={detractors} pct={pct(detractors)} />
      </div>
    </div>
  );
}

function BucketRow({ color, label, count, pct }: { color: string; label: string; count: number; pct: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: 'var(--text-secondary)' }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, background: color, borderRadius: 2, marginRight: 6 }} />
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
        {count} · {pct}%
      </span>
    </div>
  );
}

function CommentCard({
  response,
}: {
  response: { id: string; orderId: string; score: number; comment: string | null; createdAt: Date };
}) {
  const tone =
    response.score <= 6
      ? { bg: 'var(--danger-soft, #fef2f2)', color: 'var(--danger, #dc2626)' }
      : response.score <= 8
        ? { bg: 'var(--warning-soft, #FFF6E5)', color: 'var(--warning, #D97706)' }
        : { bg: 'var(--success-soft, #f0fdf4)', color: 'var(--success, #16a34a)' };

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-md)',
        padding: 16,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <span
          style={{
            padding: '4px 12px',
            background: tone.bg,
            color: tone.color,
            borderRadius: 'var(--r-pill)',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
          }}
        >
          {response.score}/10
        </span>
        <Link
          href={`/admin/orders/${response.orderId}` as Route}
          style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', textDecoration: 'none' }}
        >
          Order →
        </Link>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.55,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {response.comment}
      </p>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        {formatDateTime(response.createdAt)}
      </div>
    </div>
  );
}
