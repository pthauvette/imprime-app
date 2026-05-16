/**
 * /order/product?category=<slug> — Step 2 wizard : product picker.
 *
 * Server Component. Filtre les produits Sinalite par la famille UX choisie.
 * Chaque row linke vers /order/configure?productId=<id>.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { sinalite } from '@/lib/sinalite/client';
import { findCategoryGroup } from '@/lib/catalogue';
import type { SinaliteProduct } from '@/lib/sinalite/types';

export const metadata = { title: "Quel produit ?" };
export const dynamic = 'force-dynamic';

export default async function ProductPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category: slug } = await searchParams;
  if (!slug) notFound();

  const family = findCategoryGroup(slug);
  if (!family) notFound();

  const allProducts = await sinalite.listProducts();
  const products = allProducts.filter(
    (p) => family.sinaliteCategories.includes(p.category) && p.enabled === 1,
  );

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>
            Imprime.
          </Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb">
            <Link href={'/order/start' as Route} style={{ color: 'var(--text-muted)' }}>
              {family.name}
            </Link>
          </span>
        </div>
        <div className="progress-block">
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={2}
            aria-valuemin={1}
            aria-valuemax={7}
          >
            <div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 02 sur 07 — Produit</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Sauvegardé · 2s
          </span>
          <button className="btn btn-ghost btn-sm">⌘ K</button>
        </div>
      </header>

      <main className="step-layout">
        <div className="step-content">
          <div className="step-eyebrow">Étape 02 — {family.name}</div>
          <h1 className="step-question">
            Quel produit <em>exactement ?</em>
          </h1>
          <p className="step-lede">
            {products.length} produit{products.length > 1 ? 's' : ''} disponible{products.length > 1 ? 's' : ''} dans cette famille.
            Tous imprimés au Canada, livrés en 4-7 jours.
          </p>

          <div className="toolbar">
            <span className="toolbar-count">
              <strong>{products.length}</strong> produits
            </span>
            <div className="filter-tabs" role="tablist">
              <div className="filter-tab active" role="tab" aria-selected="true">Tous</div>
              <div className="filter-tab" role="tab">Bestsellers</div>
              <div className="filter-tab" role="tab">Premium</div>
              <div className="filter-tab" role="tab">Eco</div>
              <div className="filter-tab" role="tab">Spécialité</div>
            </div>
            <button className="sort-dropdown">
              Trier : Populaires
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {products.length === 0 ? (
            <EmptyProducts familyName={family.name} />
          ) : (
            <div className="product-list">
              {products.map((p, i) => (
                <ProductRow key={p.id} product={p} index={i} />
              ))}
            </div>
          )}
        </div>

        <aside className="recap">
          <div>
            <div className="recap-section-label">Ta commande</div>
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div className="recap-card-mini">
                <div className="recap-card-mini-img">
                  <div className="recap-card-mini-img-inner" />
                </div>
                <div className="recap-card-mini-text">
                  <div className="recap-card-mini-name">{family.name}</div>
                  <div className="recap-card-mini-meta">Catégorie sélectionnée</div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 24, display: 'grid', gap: 4 }}>
              {[
                ['Produit', 'À choisir…'],
                ['Format', '—'],
                ['Stock', '—'],
                ['Quantité', '—'],
                ['Délai', '—'],
              ].map(([label, value]) => (
                <div key={label} className="recap-row placeholder">
                  <span className="label">{label}</span>
                  <span className="value">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="expert-tip">
            <span className="expert-tip-label">★ Conseil d'expert</span>
            <p className="expert-tip-text">
              {family.slug === 'cartes-de-visite'
                ? '« Le 14pt est notre standard — léger, économique. Le 18pt soft touch est l\'option signature pour les pros. »'
                : `« Choisis le produit le plus populaire si tu hésites. Tu pourras toujours commander un échantillon avant de finaliser. »`}
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function ProductRow({ product, index }: { product: SinaliteProduct; index: number }) {
  const lower = product.name.toLowerCase();
  const isBestseller = lower.includes('uv') || lower.includes('14pt');
  const isPremium =
    lower.includes('soft touch') || lower.includes('18pt') ||
    lower.includes('foil') || lower.includes('lamination');
  const isEco = lower.includes('kraft') || lower.includes('recycled');

  let finishClass = '';
  if (lower.includes('uv') || lower.includes('gloss')) finishClass = 'gloss';
  else if (lower.includes('matte')) finishClass = 'matte';
  else if (lower.includes('foil')) finishClass = 'foil';
  else if (lower.includes('soft touch')) finishClass = 'soft';
  else if (lower.includes('kraft')) finishClass = 'kraft';

  return (
    <Link
      href={`/order/configure?productId=${product.id}` as Route}
      className="product-row"
      style={{ '--i': String(index) } as React.CSSProperties}
    >
      <div className="product-thumb">
        <div className={`product-thumb-img ${finishClass}`}>
          <div className="logo-mock" />
        </div>
      </div>
      <div className="product-info">
        <div className="product-info-top">
          <span className="product-name">{product.name.trim()}</span>
          {isBestseller && <span className="badge badge-accent">Bestseller</span>}
          {isPremium && !isBestseller && <span className="badge badge-info">Premium</span>}
          {isEco && <span className="badge badge-success">Eco</span>}
        </div>
        <div className="product-desc">
          Catégorie Sinalite : <strong>{product.category}</strong> · SKU{' '}
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{product.sku}</code>
        </div>
        <div className="product-specs">
          <span className="product-spec">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            4-7 jours
          </span>
          <span className="product-spec">📦 ID #{product.id}</span>
        </div>
      </div>
      <div className="product-price">
        <span className="product-price-label">À partir de</span>
        <span className="product-price-value">Voir prix →</span>
        <span className="product-price-unit">Configure pour devis</span>
        <span className="product-cta">Configurer →</span>
      </div>
    </Link>
  );
}

function EmptyProducts({ familyName }: { familyName: string }) {
  return (
    <div
      style={{
        padding: '64px 24px',
        background: 'var(--bg-surface)',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--r-xl)',
        textAlign: 'center',
        marginTop: 24,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>🤔</div>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          letterSpacing: '-0.01em',
          fontWeight: 400,
          margin: '0 0 8px',
        }}
      >
        Aucun produit actif dans &laquo; {familyName} &raquo;
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Tous les produits sont peut-être désactivés sur ton compte Sinalite.
        Active-les depuis le dashboard ou choisis une autre catégorie.
      </p>
      <Link href={'/order/start' as Route} className="btn btn-secondary">
        ← Choisir une autre catégorie
      </Link>
    </div>
  );
}
