/**
 * /admin/experiments — Dashboard A/B testing.
 *
 * Liste toutes les EXPERIMENTS code-defined avec :
 *   - active flag (code default vs override DB)
 *   - variants + poids
 *   - toggle on/off sans redeploy
 *   - distribution observée via WebhookEvent ? Non — pour MVP juste toggle
 *
 * Stratégie : la STRUCTURE de l'expérience reste code-defined dans
 * src/lib/ab/experiments.ts (variants, weights par défaut, label). On
 * a juste un override DB sur `active` (+ optionnel weights). Permet de
 * ramp up progressif (90/10 → 70/30 → 50/50) sans deploy.
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { EXPERIMENTS, type ExperimentId } from '@/lib/ab/experiments';
import ExperimentToggle from './ExperimentToggle';

export const metadata = { title: 'Admin — Expériences A/B' };
export const dynamic = 'force-dynamic';

export default async function AdminExperimentsPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    redirect('/sign-in?callbackUrl=/admin/experiments' as Route);
  }

  // Load all overrides en 1 query
  const allIds = Object.keys(EXPERIMENTS);
  const overrides = await prisma.experimentOverride.findMany({
    where: { experimentId: { in: allIds } },
  });
  const overrideMap = new Map(overrides.map((o) => [o.experimentId, o]));

  const rows = Object.values(EXPERIMENTS).map((exp) => {
    const ovr = overrideMap.get(exp.id);
    return {
      ...exp,
      effectiveActive: ovr ? ovr.active : exp.active,
      source: ovr ? ('override' as const) : ('code' as const),
      overrideUpdatedAt: ovr?.updatedAt ?? null,
      overrideUpdatedBy: ovr?.updatedBy ?? null,
      weightsJson: ovr?.weightsJson ?? null,
    };
  });

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="experiments"
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? '',
          role: session.user.role ?? 'USER',
        }}
      />

      <main className="adm-main" style={{ padding: '40px 48px 80px' }}>
        <header style={{ marginBottom: 32 }}>
          <div className="page-eyebrow">A/B testing</div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 40,
              letterSpacing: '-0.025em',
              fontWeight: 400,
              margin: '8px 0 8px',
            }}
          >
            Expériences A/B
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Active/désactive les expériences sans redeploy. La structure (variants, poids
            par défaut) reste code-defined dans <code>src/lib/ab/experiments.ts</code>.
          </p>
        </header>

        {rows.length === 0 ? (
          <div
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface)',
              border: '1px dashed var(--border-default)',
              borderRadius: 'var(--r-lg)',
            }}
          >
            Aucune expérience définie. Ajoute une entry dans <code>EXPERIMENTS</code>{' '}
            puis redeploy.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {rows.map((exp) => (
              <ExperimentCard key={exp.id} exp={exp} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

interface ExperimentRow {
  id: string;
  label: string;
  startedAt: string;
  variants: readonly { id: string; label: string; weight: number }[];
  effectiveActive: boolean;
  source: 'code' | 'override';
  overrideUpdatedAt: Date | null;
  overrideUpdatedBy: string | null;
  weightsJson: string | null;
}

function ExperimentCard({ exp }: { exp: ExperimentRow }) {
  const totalWeight = exp.variants.reduce((s, v) => s + v.weight, 0);
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
        padding: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            {exp.id}
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {exp.label}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Démarrée le {exp.startedAt}
            {exp.source === 'override' && exp.overrideUpdatedAt && (
              <>
                {' · '}
                <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                  Override par {exp.overrideUpdatedBy ?? 'admin'} le{' '}
                  {new Date(exp.overrideUpdatedAt).toLocaleDateString('fr-CA', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        <ExperimentToggle
          experimentId={exp.id}
          currentlyActive={exp.effectiveActive}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 8,
          marginTop: 16,
        }}
      >
        {exp.variants.map((v, idx) => {
          const pct = totalWeight > 0 ? ((v.weight / totalWeight) * 100).toFixed(0) : '0';
          return (
            <div
              key={v.id}
              style={{
                padding: '12px 14px',
                background: idx === 0 ? 'var(--bg-sunken)' : 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-sm)',
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
                  marginBottom: 4,
                }}
              >
                {v.id}
                {idx === 0 && ' · control'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.4 }}>
                {v.label}
              </div>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-primary)' }}>
                {pct}% (weight {v.weight})
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
