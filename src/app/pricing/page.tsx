/**
 * /pricing — page tarification transparente publique.
 *
 * Pas un calculateur interactif (trop complexe pour reproduire le wizard).
 * À la place : une explication claire du modèle de pricing + tableaux
 * de prix exemples pour les produits les plus vendus + CTA vers le
 * wizard pour le devis exact.
 *
 * Use case principal : visiteur en sourcing qui veut savoir "combien
 * ça coûte" sans avoir à mettre son email ou passer 5 min dans le
 * wizard. Idéal pour les décideurs B2B qui shoppent.
 */

import Link from 'next/link';
import type { Route } from 'next';
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd';
import { DELIVERY_WINDOW } from '@/lib/content/marketing';

export const metadata = {
  title: 'Tarifs — Plio',
  description: 'Tarification transparente pour cartes de visite, flyers, brochures. Prix wholesale, dégressif selon quantité, sans abonnement ni minimum absurde. Devis exact en 2 minutes.',
};

interface PricingRow {
  product: string;
  spec: string;
  pricesPerQty: { qty: number; price: number }[];
}

const PRICING_EXAMPLES: PricingRow[] = [
  {
    product: 'Cartes de visite 14pt',
    spec: '3,5 × 2 po · UV brillant',
    pricesPerQty: [
      { qty: 100, price: 52 },
      { qty: 250, price: 68 },
      { qty: 500, price: 89 },
      { qty: 1000, price: 119 },
      { qty: 2500, price: 219 },
    ],
  },
  {
    product: 'Cartes de visite 16pt',
    spec: '3,5 × 2 po · UV mat',
    pricesPerQty: [
      { qty: 100, price: 65 },
      { qty: 250, price: 89 },
      { qty: 500, price: 115 },
      { qty: 1000, price: 159 },
      { qty: 2500, price: 295 },
    ],
  },
  {
    product: 'Cartes de visite 18pt Soft Touch',
    spec: '3,5 × 2 po · finition soft touch',
    pricesPerQty: [
      { qty: 100, price: 85 },
      { qty: 250, price: 119 },
      { qty: 500, price: 159 },
      { qty: 1000, price: 229 },
      { qty: 2500, price: 449 },
    ],
  },
  {
    product: 'Flyers 100lb gloss',
    spec: '5,5 × 8,5 po · recto-verso',
    pricesPerQty: [
      { qty: 250, price: 89 },
      { qty: 500, price: 119 },
      { qty: 1000, price: 165 },
      { qty: 2500, price: 285 },
      { qty: 5000, price: 489 },
    ],
  },
  {
    product: 'Brochures pliées',
    spec: '8,5 × 11 po · 4 pages · 100lb',
    pricesPerQty: [
      { qty: 100, price: 145 },
      { qty: 250, price: 195 },
      { qty: 500, price: 269 },
      { qty: 1000, price: 419 },
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Accueil', path: '/' },
          { name: 'Tarifs', path: '/pricing' },
        ])}
      />

      <nav className="mkt-nav">
        <Link href={'/' as Route} className="mkt-brand">Plio.</Link>
        <div className="mkt-nav-links">
          <Link href={'/order/start' as Route} className="mkt-nav-link">Produits</Link>
          <Link href={'/pricing' as Route} className="mkt-nav-link active">Tarifs</Link>
          <Link href={'/blog' as Route} className="mkt-nav-link">Blog</Link>
          <Link href={'/help' as Route} className="mkt-nav-link">Aide</Link>
          <Link href={'/order/start' as Route} className="mkt-nav-cta">Commander →</Link>
        </div>
      </nav>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '64px 24px 96px' }}>
        {/* Hero */}
        <header style={{ marginBottom: 48 }}>
          <div className="page-eyebrow">Tarification</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 6vw, 56px)', letterSpacing: '-0.025em', fontWeight: 400, lineHeight: 1.05, margin: '8px 0 16px' }}>
            Prix wholesale,<br />
            <em style={{ color: 'var(--accent-primary)' }}>publié sans détours.</em>
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-secondary)', maxWidth: 720, lineHeight: 1.55, margin: 0 }}>
            Pas de devis qui prend 48 h. Pas de minimum absurde. Pas d&apos;abonnement.
            Tu paies seulement les commandes que tu passes, au tarif dégressif selon
            la quantité.
          </p>
        </header>

        {/* Modèle de pricing */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.015em', margin: '0 0 20px' }}>
            Comment on calcule.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {[
              { num: '01', title: 'Produit + options', desc: 'Le prix de base dépend du papier, format, finition. Tout est visible dans le wizard.' },
              { num: '02', title: 'Quantité dégressive', desc: 'Plus tu commandes, moins c\'est cher par unité. 1000 cartes coûtent ~0,12 $/u vs 0,52 $/u à 100.' },
              { num: '03', title: 'Délai (rush ou standard)', desc: `Standard inclus (livraison ${DELIVERY_WINDOW}). Express et Rush accélèrent la production — le surcoût exact s'affiche au devis selon le produit.` },
              { num: '04', title: 'Livraison + taxes', desc: 'UPS/Postes Canada calculés selon ta province. TPS/TVQ ajoutées au sous-total.' },
            ].map((step) => (
              <div key={step.num} style={{ padding: 22, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, color: 'var(--accent-primary)', fontWeight: 700, marginBottom: 8 }}>
                  {step.num}
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, margin: '0 0 8px' }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing tables */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.015em', margin: '0 0 8px' }}>
            Exemples concrets.
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px' }}>
            Prix indicatifs en CAD, livraison + taxes en sus. Devis exact pour ton tirage
            précis : <Link href={'/order/start' as Route} style={{ color: 'var(--accent-primary)' }}>configure dans le wizard</Link> (2 min).
          </p>

          <div style={{ display: 'grid', gap: 20 }}>
            {PRICING_EXAMPLES.map((row) => {
              const cheapestPerUnit = row.pricesPerQty.reduce((a, b) =>
                b.price / b.qty < a.price / a.qty ? b : a,
              );
              return (
                <div
                  key={row.product}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-lg)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{row.product}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{row.spec}</div>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      // Round 42 #3 — minmax(90px,1fr) floor forces the grid to exceed
                      // its container on narrow screens so overflowX:auto actually
                      // scrolls, instead of crushing 4-5 columns into ~70px slivers.
                      gridTemplateColumns: `repeat(${row.pricesPerQty.length}, minmax(90px, 1fr))`,
                      overflowX: 'auto',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    {row.pricesPerQty.map((p, i) => {
                      const unitPrice = p.price / p.qty;
                      const isBest = p.qty === cheapestPerUnit.qty;
                      return (
                        <div
                          key={p.qty}
                          style={{
                            padding: '18px 14px',
                            textAlign: 'center',
                            borderLeft: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                            background: isBest ? 'var(--accent-soft)' : 'transparent',
                            position: 'relative',
                          }}
                        >
                          {isBest && (
                            <span style={{
                              position: 'absolute', top: 6, right: 8,
                              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em',
                              textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: 700,
                            }}>★ Best</span>
                          )}
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                            {p.qty.toLocaleString('fr-CA')} u
                          </div>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-primary)', fontWeight: 400, marginTop: 4 }}>
                            {p.price} $
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                            {(unitPrice * 100).toFixed(unitPrice < 0.10 ? 1 : 0)}¢ / u
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Pricing FAQ */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.015em', margin: '0 0 20px' }}>
            Questions sur le prix.
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {PRICING_FAQ.map((f) => (
              <details
                key={f.q}
                style={{
                  padding: 20,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {f.q}
                </summary>
                <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section
          style={{
            padding: 32,
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--r-xl)',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, letterSpacing: '-0.015em', margin: '0 0 12px' }}>
            Devis exact en <em>2 minutes.</em>
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
            Aucune carte de crédit requise tant que tu ne paies pas. Configure, vois le
            prix changer en temps réel, exporte le devis si tu veux.
          </p>
          <Link href={'/order/start' as Route} className="btn btn-primary">
            Démarrer un devis →
          </Link>
        </section>
      </main>
    </>
  );
}

const PRICING_FAQ = [
  {
    q: 'Pourquoi le prix par unité baisse autant à 1000 ?',
    a: 'Le coût fixe (setup, presse, fichier) est amorti sur le tirage. À 100 cartes, le setup pèse plus que l\'impression elle-même. À 1000, le setup est négligeable et tu paies surtout le papier + l\'encre — d\'où la baisse de 50-70 %.',
  },
  {
    q: 'Y a-t-il un minimum de commande ?',
    a: 'Pas vraiment. Le wizard accepte les tirages dès 25-50 unités (selon produit). Sache juste que le coût par unité est élevé à petit volume — pour un seul lot de cartes c\'est ~0,50 $/u, ce qui peut être plus cher qu\'un imprimeur de quartier.',
  },
  {
    q: 'Les prix sont-ils négociables pour gros volume ?',
    a: 'Pour les comptes reseller (agences, studios qui revendent), oui — le tier wholesale s\'applique automatiquement après approbation de ton application. Pour les autres, le pricing public est ce qu\'il y a de mieux.',
  },
  {
    q: 'Comment se compare votre prix à Vistaprint ?',
    a: 'On est généralement 15-30 % moins cher sur les produits comparables, ET on imprime 100 % au Canada (certains concurrents outsource une partie en Inde / Tunisie). Pour les comparaisons précises, va dans le wizard avec ton tirage — chaque option a son prix.',
  },
  {
    q: 'TPS et TVQ inclues dans les prix affichés ?',
    a: 'Non, les prix tableau ci-dessus sont hors taxes. La TPS (5 %) + TVQ (9,975 %) sont ajoutées au sous-total au checkout, calculées selon ta province de livraison (QC = TPS+TVQ, ON = HST 13 %, AB = TPS seulement, etc.).',
  },
];
