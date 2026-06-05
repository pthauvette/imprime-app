'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, useState } from 'react';
import ClientHeaderUserSlot from '@/components/account/ClientHeaderUserSlot';
import {
  getVirtualProduct,
  virtualPapers,
  virtualFinishes,
  resolveVirtualProductId,
} from '@/lib/products/virtual-products';

/**
 * Sélecteur GÉNÉRIQUE d'un produit virtuel : Papier (axe 1) puis Finition (axe 2,
 * dépendante du papier). Le couple choisi résout un productId Sinalite et renvoie
 * au wizard de config normal. Remplace la liste des productId redondants d'une
 * famille (cartes de visite, cartes postales, …).
 */
export default function VirtualProductPicker({
  slug,
  designId,
  allowedProductIds,
}: {
  slug: string;
  designId: string | null;
  /** Audit v3 L1 — productId réellement actifs (filtrage enabled/overrides). */
  allowedProductIds?: number[];
}) {
  const router = useRouter();
  const vp = getVirtualProduct(slug)!; // la route valide l'existence en amont
  const allowed = useMemo(
    () => (allowedProductIds ? new Set(allowedProductIds) : undefined),
    [allowedProductIds],
  );
  const papers = useMemo(() => virtualPapers(slug, allowed), [slug, allowed]);

  const [paper, setPaper] = useState<string>(papers[0]?.key ?? '');
  const finishes = useMemo(() => virtualFinishes(slug, paper, allowed), [slug, paper, allowed]);
  const [finish, setFinish] = useState<string>(finishes[0]?.finish ?? '');

  // Changer de papier → reset la finition sur la 1re dispo de ce papier.
  function pickPaper(key: string) {
    setPaper(key);
    const first = virtualFinishes(slug, key, allowed)[0];
    setFinish(first?.finish ?? '');
  }

  const resolvedId = resolveVirtualProductId(slug, paper, finish);
  const designSuffix = designId ? `&designId=${designId}` : '';
  const nextHref = resolvedId
    ? (`/order/configure?productId=${resolvedId}${designSuffix}` as Route)
    : null;

  const paperMeta = papers.find((p) => p.key === paper);
  const finishMeta = finishes.find((f) => f.finish === finish);

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>Plio.</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb">
            <Link href={'/order/start' as Route} style={{ color: 'var(--text-muted)' }}>Commander</Link>
            <span className="breadcrumb-sep">›</span> {vp.name}
          </span>
        </div>
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuenow={2} aria-valuemin={1} aria-valuemax={6}>
            <div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 02 sur 06 — Papier & finition</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <ClientHeaderUserSlot hideWhenAnonymous />
        </div>
      </header>

      <main className="step-layout">
        <div className="step-content" style={{ maxWidth: 1080 }}>
          <div className="step-eyebrow">{vp.eyebrow}</div>
          <h1 className="step-question">Choisis ton <em>papier &amp; ta finition.</em></h1>
          <p className="step-lede">{vp.lede}</p>

          {/* ── Papier ── */}
          <section style={{ padding: '40px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 16, alignItems: 'baseline', marginBottom: 24 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>I.</span>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.01em', margin: '0 0 4px', fontWeight: 400 }}>Papier</h2>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{papers.length} papiers disponibles</div>
              </div>
            </div>
            <div className="stock-grid">
              {papers.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`stock-card${paper === p.key ? ' selected' : ''}`}
                  onClick={() => pickPaper(p.key)}
                >
                  <div className={`stock-swatch ${swatchClass(p.key)}`} />
                  <div className="stock-body">
                    <div className="stock-name">{p.label}{p.specialty ? ' ★' : ''}</div>
                    <div className="stock-desc">{p.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ── Finition ── */}
          <section style={{ padding: '40px 0', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 16, alignItems: 'baseline', marginBottom: 24 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>II.</span>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.01em', margin: '0 0 4px', fontWeight: 400 }}>Finition</h2>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{finishes.length} finition{finishes.length > 1 ? 's' : ''} pour {paperMeta?.label ?? paper}</div>
              </div>
            </div>
            <div className="finish-pills" role="tablist">
              {finishes.map((f) => (
                <button
                  key={f.finish}
                  type="button"
                  role="tab"
                  aria-selected={finish === f.finish}
                  className={`finish-pill${finish === f.finish ? ' active' : ''}`}
                  onClick={() => setFinish(f.finish)}
                >
                  {f.finishLabel}
                </button>
              ))}
            </div>
            {finishMeta?.note && (
              <p style={{ marginTop: 14, fontSize: 13, color: 'var(--text-secondary)' }}>💡 {finishMeta.note}</p>
            )}
          </section>
        </div>

        <aside className="recap">
          <div>
            <div className="recap-section-label">Ton choix</div>
            <div style={{ marginTop: 12 }}>
              <div className="recap-config-row">
                <span className="label">Produit</span>
                <span className="value">{vp.name}</span>
              </div>
              <div className="recap-config-row">
                <span className="label">Papier</span>
                <span className="value">{paperMeta?.label ?? '—'}</span>
              </div>
              <div className="recap-config-row">
                <span className="label">Finition</span>
                <span className="value">{finishMeta?.finishLabel ?? '—'}</span>
              </div>
            </div>
            <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Le format, la quantité et le prix se choisissent à l&apos;étape suivante — le prix s&apos;affiche en temps réel.
            </div>
          </div>
        </aside>
      </main>

      <footer className="shell-footer">
        <div>
          <Link href={'/order/start' as Route} className="btn btn-ghost">
            <span style={{ fontFamily: 'var(--font-mono)' }}>←</span> Précédent
          </Link>
        </div>
        <div className="shell-footer-center">↵ Entrée pour continuer</div>
        <div className="shell-footer-right">
          <button
            className="btn btn-primary"
            onClick={() => nextHref && router.push(nextHref)}
            disabled={!nextHref}
          >
            Configurer →
          </button>
        </div>
      </footer>
    </div>
  );
}

function swatchClass(paperKey: string): string {
  switch (paperKey) {
    case 'kraft': return 'kraft';
    case 'enviro': case 'linen': return 'matte';
    case 'ultrasmooth': case 'pearl': case 'synthetic': return 'soft';
    default: return 'coated';
  }
}
