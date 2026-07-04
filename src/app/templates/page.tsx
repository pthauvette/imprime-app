/**
 * /templates — galerie des templates customisables.
 *
 * Liste dynamique depuis le registry. Clic sur une card → /design/[slug]
 * où le user customise et exporte le PDF print-ready.
 */

import Link from 'next/link';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import { ALL_TEMPLATES, listProductTypes } from '@/lib/templates/registry';
import type { AppTemplate } from '@/lib/templates/types';

export const metadata = { title: 'Templates — Plio' };

interface PageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function TemplatesPage({ searchParams }: PageProps) {
  const productTypes = listProductTypes();
  const sp = await searchParams;
  const activeType = sp.type ?? null;

  // Round 30 #5 — Avant les filter chips étaient des <div> inertes (le
  // premier marqué "active" mais aucun onClick) → cliquer ne faisait
  // rien. Maintenant : Links avec ?type=X, filtrage côté serveur. Reste
  // Server Component (zéro JS), back/forward browser fonctionne, SEO OK.
  const filtered = activeType
    ? ALL_TEMPLATES.filter((t) => t.productType === activeType)
    : ALL_TEMPLATES;

  return (
    <div className="acct-shell">
      <Sidebar active="/templates" />

      <main className="acct-main">
        <div className="page-eyebrow">Templates customisables</div>
        <h1 className="page-title">Pars d'un design <em>fini.</em></h1>
        <p className="page-lede">
          Modifie le texte et les couleurs en 30 secondes, on génère le PDF print-ready
          (300 DPI, bleed 1/8", converti CMYK à la presse) prêt à imprimer. Aucun logiciel à installer.
        </p>

        <div className="tpl-filters" style={{ marginTop: 32 }}>
          <Link
            href={'/templates' as Route}
            className={`tpl-filter${activeType === null ? ' active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            Tous ({ALL_TEMPLATES.length})
          </Link>
          {productTypes.map((pt) => (
            <Link
              key={pt.type}
              href={`/templates?type=${encodeURIComponent(pt.type)}` as Route}
              className={`tpl-filter${activeType === pt.type ? ' active' : ''}`}
              style={{ textDecoration: 'none' }}
            >
              {pt.label} ({pt.count})
            </Link>
          ))}
        </div>

        <div className="section-header" style={{ marginTop: 32 }}>
          <h2 className="section-header-title">
            {activeType
              ? productTypes.find((p) => p.type === activeType)?.label ?? 'Templates'
              : 'Tous les templates'}
          </h2>
          <span className="section-header-meta">
            {filtered.length} template{filtered.length > 1 ? 's' : ''} · gratuit{filtered.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="tpl-grid">
          {filtered.map((t) => (
            <TemplateCard key={t.slug} template={t} />
          ))}
          {filtered.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, gridColumn: '1 / -1', padding: '32px 0' }}>
              Aucun template dans cette catégorie pour le moment. <Link href={'/templates' as Route} style={{ color: 'var(--accent-primary)' }}>Voir tous les templates</Link> ou <Link href={'/quote' as Route} style={{ color: 'var(--accent-primary)' }}>demande un devis</Link>.
            </p>
          )}
        </div>

        <div className="tpl-legend">
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
            } as React.CSSProperties}
          >
            ★ LÉGENDE
          </span>
          <span className="tpl-legend-dot bleed">Zone de bleed (0,125")</span>
          <span className="tpl-legend-dot safe">Safe zone (texte/logos)</span>
        </div>
      </main>
    </div>
  );
}

function TemplateCard({ template }: { template: AppTemplate }) {
  return (
    <Link
      href={`/design/${template.slug}` as Route}
      className="tpl-card"
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div className="tpl-preview" style={{ background: template.accentColor + '15' }}>
        <div
          style={{
            position: 'absolute',
            inset: 12,
            background: 'var(--bg-surface)',
            borderRadius: 'var(--r-sm)',
            border: `2px solid ${template.accentColor}30`,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: template.accentColor,
              marginBottom: 4,
            }}
          >
            {template.sampleValues.name ?? 'Ton nom'}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {template.sampleValues.title ?? ''}
          </div>
        </div>
        <span className="tpl-format-badge">{template.variant}"</span>
      </div>
      <div className="tpl-body">
        <div className="tpl-name">{template.name}</div>
        <div className="tpl-meta">{template.description}</div>
        <div className="tpl-bottom">
          <div className="tpl-formats">
            {template.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="tpl-format">{tag}</span>
            ))}
          </div>
          <div
            className="tpl-download"
            style={{ background: template.accentColor, color: '#fff' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}
