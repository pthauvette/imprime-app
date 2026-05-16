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

export default function TemplatesPage() {
  const productTypes = listProductTypes();

  return (
    <div className="acct-shell">
      <Sidebar active="/templates" />

      <main className="acct-main">
        <div className="page-eyebrow">Templates customisables</div>
        <h1 className="page-title">Pars d'un design <em>fini.</em></h1>
        <p className="page-lede">
          Modifie le texte et les couleurs en 30 secondes, on génère le PDF print-ready
          (CMYK, 300 DPI, bleed 1/8") prêt à imprimer. Aucun logiciel à installer.
        </p>

        <div className="tpl-filters" style={{ marginTop: 32 }}>
          <div className="tpl-filter active">Tous ({ALL_TEMPLATES.length})</div>
          {productTypes.map((pt) => (
            <div key={pt.type} className="tpl-filter">
              {pt.label} ({pt.count})
            </div>
          ))}
        </div>

        <div className="section-header" style={{ marginTop: 32 }}>
          <h2 className="section-header-title">Tous les templates</h2>
          <span className="section-header-meta">
            {ALL_TEMPLATES.length} templates · gratuits
          </span>
        </div>

        <div className="tpl-grid">
          {ALL_TEMPLATES.map((t) => (
            <TemplateCard key={t.slug} template={t} />
          ))}
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
