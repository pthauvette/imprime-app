/**
 * /order/start — Step 1 wizard : category picker.
 *
 * Server Component qui fetch le catalogue Sinalite et groupe en 8 familles
 * éditoriales (voir lib/catalogue.ts). Chaque carte linke vers
 * /order/product?category=<slug>.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { sinalite } from '@/lib/sinalite/client';
import { groupProductsByFamily } from '@/lib/catalogue';
import CategoryIcon from '@/components/wizard/CategoryIcon';
import { formatCurrency } from '@/lib/format';

export const metadata = { title: "Quoi imprimer ?" };
export const dynamic = 'force-dynamic';

export default async function OrderStartPage() {
  const products = await sinalite.listProducts();
  const families = groupProductsByFamily(products)
    .filter((f) => f.productCount > 0)
    .slice(0, 8);

  const totalProducts = products.filter((p) => p.enabled === 1).length;

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>
            Imprime.
          </Link>
        </div>
        <div className="progress-block">
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={1}
            aria-valuemin={1}
            aria-valuemax={7}
            aria-label="Étape 1 sur 7"
          >
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 01 sur 07 — Catégorie</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <button className="btn btn-ghost btn-sm">⌘ K</button>
        </div>
      </header>

      <main className="step-layout">
        <div className="step-content">
          <div className="step-eyebrow">Étape 01</div>
          <h1 className="step-question">
            Quoi imprimer
            <br />
            <em>aujourd'hui ?</em>
          </h1>
          <p className="step-lede">
            Plus de {formatCurrency(totalProducts).replace(/[^\d\s]/g, '').trim()} produits actifs, devis instantané, livraison partout au Canada en 1 à 7 jours.
          </p>

          <div className="social-proof-row">
            <span className="social-proof">47 commandes dans la dernière heure</span>
            <span className="social-proof">4,9 sur 5 — 12k+ avis Trustpilot</span>
            <span className="social-proof">Prix wholesale, sans abonnement</span>
          </div>

          <div className="search-block">
            <label className="search">
              <svg
                className="search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Cherche 'cartes de visite', 'flyers 8,5×11'…"
                autoFocus
                defaultValue=""
              />
              <span className="search-kbd">/</span>
            </label>
          </div>

          <div className="category-grid">
            {families.map((family, i) => (
              <Link
                key={family.slug}
                href={`/order/product?category=${family.slug}` as Route}
                className="cat-card"
                style={{ '--i': String(i) } as React.CSSProperties}
              >
                <div className="cat-card-top">
                  <CategoryIcon icon={family.icon} />
                  <span className="cat-num">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="cat-body">
                  <div className="cat-name">{family.name}</div>
                  <div className="cat-desc">{family.description}</div>
                </div>
                <div className="cat-price-row">
                  <span className="cat-price-label">{family.productCount} produit{family.productCount > 1 ? 's' : ''}</span>
                  <span className="cat-price">Explorer →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="recap">
          <div>
            <div className="recap-section-label">Comment ça marche</div>
            <ol className="how-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li className="how-item active">
                <span className="how-item-num">1</span>
                <span className="how-item-text">Choisis une catégorie</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">2</span>
                <span className="how-item-text">Pick le produit exact</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">3</span>
                <span className="how-item-text">Format, papier, finition</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">4</span>
                <span className="how-item-text">Quantité &amp; prix live</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">5</span>
                <span className="how-item-text">Téléverse ton design</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">6</span>
                <span className="how-item-text">Adresse &amp; livraison</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">7</span>
                <span className="how-item-text">Paiement &amp; production</span>
              </li>
            </ol>
          </div>
        </aside>
      </main>
    </div>
  );
}
