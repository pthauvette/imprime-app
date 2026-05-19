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
import { applyProductOverrides } from '@/lib/products/overrides';
import { findCategoryGroup } from '@/lib/catalogue';
import JsonLd, { breadcrumbSchema, itemListSchema } from '@/components/seo/JsonLd';
import ProductListClient from '@/components/wizard/ProductListClient';
import HeaderUserSlot from '@/components/account/HeaderUserSlot';

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
  // Filtre Sinalite-enabled, puis applique les overrides admin (qui peuvent
  // hide certains produits supplémentaires via ProductOverride.disabled).
  const sinaliteEnabled = allProducts.filter(
    (p) => family.sinaliteCategories.includes(p.category) && p.enabled === 1,
  );
  const products = await applyProductOverrides(sinaliteEnabled);

  return (
    <div className="shell">
      <JsonLd data={breadcrumbSchema([
        { name: 'Accueil', path: '/' },
        { name: 'Commander', path: '/order/start' },
        { name: family.name, path: `/order/product?category=${slug}` },
      ])} />
      {products.length > 0 && (
        <JsonLd
          data={itemListSchema(
            products.map((p) => ({
              name: p.name.trim(),
              path: `/order/configure?productId=${p.id}`,
            })),
          )}
        />
      )}
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>
            Plio.
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
          <HeaderUserSlot hideWhenAnonymous />
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

          {products.length === 0 ? (
            <EmptyProducts familyName={family.name} />
          ) : (
            <ProductListClient products={products} />
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
        Cette catégorie est temporairement vide. Choisis une autre catégorie ou
        écris-nous si tu cherches un produit spécifique.
      </p>
      <Link href={'/order/start' as Route} className="btn btn-secondary">
        ← Choisir une autre catégorie
      </Link>
    </div>
  );
}
