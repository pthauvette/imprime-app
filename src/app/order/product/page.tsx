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
import { DELIVERY_WINDOW } from '@/lib/content/marketing';
import ProductListClient from '@/components/wizard/ProductListClient';
import ProductMockup from '@/components/wizard/ProductMockup';
import { mockupForIcon } from '@/lib/products/product-mockup';
import HeaderUserSlot from '@/components/account/HeaderUserSlot';
import {
  ALL_VIRTUAL_PRODUCT_IDS,
  virtualSlugForProductId,
  getVirtualProduct,
} from '@/lib/products/virtual-products';
import { getStartingPrices } from '@/lib/products/starting-price-store';
import { formatCents } from '@/lib/format';

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
  const mock = mockupForIcon(family.icon);

  const allProducts = await sinalite.listProducts();
  // Filtre Sinalite-enabled, puis applique les overrides admin (qui peuvent
  // hide certains produits supplémentaires via ProductOverride.disabled).
  const sinaliteEnabled = allProducts.filter(
    (p) => family.sinaliteCategories.includes(p.category) && p.enabled === 1,
  );
  const products = await applyProductOverrides(sinaliteEnabled);

  // Collapse : les productId couverts par un produit virtuel (papier × finition)
  // sont remplacés par UNE carte virtuelle ; les autres produits (Foil, Die Cut,
  // Letterhead, Notepads…) restent listés tels quels. Allège fortement les
  // familles redondantes (ex. stationnerie : 45 produits → ~6 cartes + le reste).
  const rawProducts = products.filter((p) => !ALL_VIRTUAL_PRODUCT_IDS.has(p.id));
  const virtualSlugs: string[] = [];
  for (const p of products) {
    const vs = virtualSlugForProductId(p.id);
    if (vs && !virtualSlugs.includes(vs)) virtualSlugs.push(vs);
  }
  const entryCount = virtualSlugs.length + rawProducts.length;

  // Prix « à partir de » (table ProductStartingPrice, remplie par le cron
  // refresh-product-prices) : UNE requête DB pour rows brutes + variantes des
  // produits virtuels. Id absent = pas encore balayé → la row garde son
  // fallback « Voir prix → » (jamais de chiffre inventé, pattern #8.7).
  const priceMap = await getStartingPrices([
    ...rawProducts.map((p) => p.id),
    ...virtualSlugs.flatMap((vs) => getVirtualProduct(vs)!.variants.map((v) => v.productId)),
  ]);
  const startingPrices = Object.fromEntries(priceMap);
  /** Min sur les variantes (papier × finition) couvertes par la carte virtuelle. */
  function virtualStartingCents(vs: string): number | null {
    const cents = getVirtualProduct(vs)!.variants
      .map((v) => priceMap.get(v.productId))
      .filter((c): c is number => c !== undefined);
    return cents.length > 0 ? Math.min(...cents) : null;
  }

  // Structured data (ItemList) = la vue COLLAPSÉE, pas les productId bruts : une
  // entrée /order/v/<slug> par produit virtuel + /order/configure pour le reste.
  // Évite d'émettre 5 flyers quasi-identiques aux moteurs (même redondance qu'on
  // élimine dans l'UI).
  const itemListEntries = [
    ...virtualSlugs.map((vs) => ({ name: getVirtualProduct(vs)!.name, path: `/order/v/${vs}` })),
    ...rawProducts.map((p) => ({ name: p.name.trim(), path: `/order/configure?productId=${p.id}` })),
  ];

  return (
    <div className="shell">
      <JsonLd data={breadcrumbSchema([
        { name: 'Accueil', path: '/' },
        { name: 'Commander', path: '/order/start' },
        { name: family.name, path: `/order/product?category=${slug}` },
      ])} />
      {itemListEntries.length > 0 && (
        <JsonLd data={itemListSchema(itemListEntries)} />
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
            aria-valuemax={6}
          >
            <div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 02 sur 06 — Produit</div>
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
            {entryCount} produit{entryCount > 1 ? 's' : ''} disponible{entryCount > 1 ? 's' : ''} dans cette famille.
            Tous imprimés au Canada, livrés en {DELIVERY_WINDOW}.
          </p>

          {/* Cartes des produits VIRTUELS (papier × finition regroupés). */}
          {virtualSlugs.length > 0 && (
            <div className="stock-grid" style={{ marginBottom: rawProducts.length > 0 ? 32 : 0 }}>
              {virtualSlugs.map((vs) => {
                const vp = getVirtualProduct(vs)!;
                const fromCents = virtualStartingCents(vs);
                return (
                  <Link
                    key={vs}
                    href={`/order/v/${vs}` as Route}
                    className="stock-card"
                    style={{ textDecoration: 'none' }}
                  >
                    <div className="stock-swatch coated" />
                    <div className="stock-body">
                      <div className="stock-name">{vp.name} <span style={{ color: 'var(--accent-primary)' }}>★</span></div>
                      <div className="stock-desc">
                        {fromCents !== null && (
                          <strong style={{ color: 'var(--text-primary)' }}>À partir de {formatCents(fromCents)} · </strong>
                        )}
                        {vp.variants.length} finitions · papier + finition au choix
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {entryCount === 0 ? (
            <EmptyProducts familyName={family.name} />
          ) : rawProducts.length > 0 ? (
            <ProductListClient
              products={rawProducts}
              mockupShape={mock.shape}
              mockupFinish={mock.finish}
              startingPrices={startingPrices}
            />
          ) : null}
        </div>

        <aside className="recap">
          <div>
            <div className="recap-section-label">Ta commande</div>
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div className="recap-card-mini">
                <div className="recap-card-mini-img">
                  <ProductMockup shape={mock.shape} finish={mock.finish} height={40} />
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
