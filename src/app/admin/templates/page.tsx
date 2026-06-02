/**
 * /admin/templates — Templates CRUD live data.
 *
 * Source of truth : registry hardcodé en TS (src/lib/templates/registry.ts).
 * Stats DB : pour chaque template, on lookup le Template row shadow (créé
 * lors du premier /api/designs/finalize) et on compte DesignDraft.
 *
 * "Brouillons" section : DesignDraft pas encore commandé (orderId null). NB :
 * `finalPdfUrl` est TOUJOURS set par /api/designs/finalize (pas d'autosave),
 * donc filtrer sur `finalPdfUrl: null` ne matchait jamais rien → section vide.
 * Le vrai signal « brouillon pas commandé » = `orderId: null` (cf. commentaire
 * du schéma DesignDraft.orderId, et le fix user-facing /drafts PR #208).
 */

import Link from 'next/link';
import type { Route } from 'next';
import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { ALL_TEMPLATES, listProductTypes } from '@/lib/templates/registry';
import type { AppTemplate } from '@/lib/templates/types';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Admin — Templates · Plio' };
export const dynamic = 'force-dynamic';

export default async function AdminTemplatesPage() {
  const { session } = await requireAdminPage();

  const [usersCount, ordersCount, allDbTemplates, draftsCount, recentDrafts, designs30d] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.template.findMany({
      include: { _count: { select: { designs: true } } },
    }),
    prisma.designDraft.count({ where: { orderId: null } }),
    prisma.designDraft.findMany({
      where: { orderId: null },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { user: { select: { email: true } } },
    }),
    prisma.designDraft.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } }),
  ]);

  const dbBySlug = new Map(allDbTemplates.map((t) => [t.slug, t]));
  const productTypes = listProductTypes();
  const totalDesigns = allDbTemplates.reduce((a, t) => a + t._count.designs, 0);

  const topPerformer = [...allDbTemplates].sort((a, b) => b._count.designs - a._count.designs)[0];
  const topPerformerTpl = topPerformer ? ALL_TEMPLATES.find((t) => t.slug === topPerformer.slug) : null;

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="templates"
        counts={{ orders: ordersCount, users: usersCount, templates: ALL_TEMPLATES.length }}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Templates</h1>
            <p className="adm-page-subtitle">
              {ALL_TEMPLATES.length} publié{ALL_TEMPLATES.length > 1 ? 's' : ''} · {draftsCount} brouillon{draftsCount > 1 ? 's' : ''} · {designs30d} design{designs30d > 1 ? 's' : ''} créé{designs30d > 1 ? 's' : ''} ce mois-ci
            </p>
          </div>
          {/* Round 14 #5 : "+ Nouveau template" disabled retiré. Templates
              vivent dans le code (src/lib/templates/) — pas de UI éditeur
              pour MVP. Hint dans le copy de la page. */}
        </header>

        {/* Pills informationnelles (distribution par type). Pas de click-to-filter
            wired — c'est un overview, pas un filter. Si on veut le filter plus
            tard, ajouter du searchParams handling sur cette page. */}
        <div className="adm-pills" style={{ marginBottom: 24 }} aria-label="Distribution des templates par type">
          <span className="adm-pill active">
            Tous <span className="adm-pill-count">{ALL_TEMPLATES.length}</span>
          </span>
          {productTypes.map((pt) => (
            <span key={pt.type} className="adm-pill">
              {pt.label} <span className="adm-pill-count">{pt.count}</span>
            </span>
          ))}
          {draftsCount > 0 && (
            <span className="adm-pill">
              Brouillons <span className="adm-pill-count">{draftsCount}</span>
            </span>
          )}
        </div>

        <section className="adm-stats" style={{ marginBottom: 24 }}>
          <StatCard label="Designs créés 30 j" value={String(designs30d)} sub="via /design/[slug]" />
          <StatCard label="Total designs" value={String(totalDesigns)} sub="depuis le launch" />
          <StatCard label="Conversion design → order" value="—" sub="à wirer (DesignDraft ↔ Order)" />
          <StatCard
            label="Top performer"
            value={topPerformerTpl?.name.split(' — ')[0] ?? '—'}
            sub={topPerformer ? `${topPerformer._count.designs} design${topPerformer._count.designs > 1 ? 's' : ''}` : 'aucun encore'}
          />
        </section>

        <section>
          <div className="adm-section-head" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="adm-section-title" style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.01em', margin: 0, fontWeight: 400 }}>
              Templates publiés
            </h2>
            <span className="adm-section-meta" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              source : src/lib/templates/registry.ts
            </span>
          </div>

          <div className="adm-tpl-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {ALL_TEMPLATES.map((t) => (
              <TemplateCard
                key={t.slug}
                template={t}
                designCount={dbBySlug.get(t.slug)?._count.designs ?? 0}
              />
            ))}
          </div>
        </section>

        {draftsCount > 0 && (
          <section style={{ marginTop: 48 }}>
            <div className="adm-section-head" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 className="adm-section-title" style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.01em', margin: 0, fontWeight: 400 }}>
                Brouillons users{' '}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>
                  ({draftsCount})
                </span>
              </h2>
            </div>

            <div className="adm-tpl-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {recentDrafts.map((d) => {
                const tpl = ALL_TEMPLATES.find((t) =>
                  allDbTemplates.find((dbt) => dbt.id === d.templateId)?.slug === t.slug,
                );
                return (
                  <div
                    key={d.id}
                    className="adm-tpl-card adm-tpl-card-draft"
                    style={{
                      padding: 16,
                      background: 'var(--bg-surface)',
                      border: '1px dashed var(--border-default)',
                      borderRadius: 'var(--r-lg)',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {tpl?.name ?? 'Template inconnu'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {d.user.email} · {formatDate(d.updatedAt.toISOString())}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
                      ⚠ Non finalisé
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value">{value}</div>
      <div className="adm-stat-detail" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

function TemplateCard({ template, designCount }: { template: AppTemplate; designCount: number }) {
  return (
    <Link
      href={`/design/${template.slug}` as Route}
      className="adm-tpl-card"
      style={{
        padding: 16,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
        textDecoration: 'none',
        color: 'inherit',
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        className="adm-tpl-thumb"
        style={{
          aspectRatio: '7/4',
          background: template.accentColor + '15',
          borderRadius: 'var(--r-md)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: template.accentColor, marginBottom: 2 }}>
          {template.sampleValues.name}
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>
          {template.sampleValues.title ?? template.sampleValues.studio ?? ''}
        </div>
        <span
          className="badge badge-success adm-tpl-thumb-badge"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.04em',
          }}
        >
          {template.variant}"
        </span>
      </div>

      <div className="adm-tpl-body">
        <div className="adm-tpl-name" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
          {template.name}
        </div>
        <div className="adm-tpl-slug" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          {template.slug}
        </div>
        <div className="adm-tpl-meta" style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.4 }}>
          {template.description}
        </div>
      </div>

      <div
        className="adm-tpl-foot"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 8,
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          {designCount} design{designCount !== 1 ? 's' : ''} créé{designCount !== 1 ? 's' : ''}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--accent-primary)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          Aperçu →
        </span>
      </div>
    </Link>
  );
}
