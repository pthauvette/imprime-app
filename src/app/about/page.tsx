/**
 * /about — page À propos honnête.
 *
 * Pas de fake stats ni de press coverage fictive — Plio vient de lancer.
 * Focus : pourquoi on existe + qui on est + ce qu'on garantit.
 * Trust signals réels : adresse Montréal, fondateur nommé, presse partenaire
 * Sinalite (Markham, ON), service en français.
 */

import Link from 'next/link';
import type { Route } from 'next';
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd';

export const metadata = {
  title: 'À propos de Plio — print wholesale au Canada',
  description: 'Plio est une plateforme québécoise qui rend l\'impression wholesale aussi simple qu\'une commande Uber : devis instantané, prix transparent, livraison 4-7 jours.',
};

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Accueil', path: '/' },
          { name: 'À propos', path: '/about' },
        ])}
      />

      <nav className="mkt-nav">
        <Link href={'/' as Route} className="mkt-brand">Plio.</Link>
        <div className="mkt-nav-links">
          <Link href={'/order/start' as Route} className="mkt-nav-link">Produits</Link>
          <Link href={'/blog' as Route} className="mkt-nav-link">Blog</Link>
          <Link href={'/about' as Route} className="mkt-nav-link active">À propos</Link>
          <Link href={'/contact' as Route} className="mkt-nav-link">Contact</Link>
          <Link href={'/order/start' as Route} className="mkt-nav-cta">Commander →</Link>
        </div>
      </nav>

      <main>
        {/* HERO */}
        <section className="about-hero">
          <div className="page-eyebrow">Fondée à Montréal · 2026</div>
          <h1>Le print méritait <em>mieux.</em></h1>
          <p>
            Plio existe pour donner aux designers, agences et entrepreneurs un accès direct,
            transparent et instantané à l&apos;impression wholesale canadienne. Plus d&apos;attente,
            plus de devis flou.
          </p>
        </section>

        {/* MISSION */}
        <section className="mission">
          <div>
            <div className="mission-eyebrow">★ Notre mission</div>
            <h2>Pourquoi on a démarré <em>Plio.</em></h2>
            <p>
              Avant Plio, commander 500 cartes de visite voulait souvent dire <strong>trois
              courriels, deux relances, 48 heures d&apos;attente</strong> et un PDF de devis
              rempli de mentions floues. Quand ton fichier était refusé, personne ne
              t&apos;expliquait précisément pourquoi — juste « renvoie-le ».
            </p>
            <p>
              On a vécu cette douleur trop souvent du côté studio. Alors on a bâti
              l&apos;inverse : un <strong>devis instantané</strong> qui change à chaque clic,
              une <strong>tarification publique au cent près</strong>, et un wizard qui te
              guide étape par étape sans jargon.
            </p>
            <p>
              Plio ne réinvente pas l&apos;impression. On rebrasse l&apos;expérience autour.
              Notre presse partenaire est un imprimeur wholesale canadien établi en Ontario
              avec 20+ ans d&apos;expérience — qualité industrielle garantie. Notre travail à
              nous, c&apos;est de te faire gagner ton vendredi après-midi.
            </p>
          </div>
          <div className="mission-visual">
            <div className="mission-stamp">Made in<br />MTL</div>
          </div>
        </section>

        {/* PROMISES (remplace les fake stats) */}
        <section className="stats-section">
          <div className="stats-inner">
            <div className="mission-eyebrow">★ Nos engagements</div>
            <h2>Quatre <em>promesses claires.</em></h2>
            <div className="stats-grid">
              <div className="stat">
                <div className="stat-value">2 <em>min</em></div>
                <div className="stat-label">Pour boucler un devis sans contact humain</div>
              </div>
              <div className="stat">
                <div className="stat-value">100<em>%</em></div>
                <div className="stat-label">Imprimé au Canada — pas d&apos;outsource étranger</div>
              </div>
              <div className="stat">
                <div className="stat-value">4-7<em> j</em></div>
                <div className="stat-label">Livraison standard partout au Canada</div>
              </div>
              <div className="stat">
                <div className="stat-value">FR / EN</div>
                <div className="stat-label">Service bilingue, jamais traduit à la machine</div>
              </div>
            </div>
          </div>
        </section>

        {/* FOUNDER */}
        <section className="founders">
          <div className="founders-head">
            <div className="mission-eyebrow">★ Derrière Plio</div>
            <h2>Une petite équipe, <em>basée à Montréal.</em></h2>
            <p>
              Plio est un produit de <strong>Démocratik inc.</strong> — une jeune entreprise
              québécoise. On est petits par choix : pas de paliers de support, pas de chatbot
              qui te renvoie à un humain qui te renvoie au chatbot. Quand tu écris, c&apos;est
              quelqu&apos;un de l&apos;équipe qui répond.
            </p>
          </div>
          <div className="founders-grid">
            <div className="founder-card">
              <div className="founder-avatar fa-1">PT</div>
              <div className="founder-role">Fondateur · Démocratik inc.</div>
              <h3 className="founder-name">Patrick Thauvette</h3>
              <p className="founder-bio">
                Construit Plio pour le studio qu&apos;il aurait voulu avoir comme fournisseur
                d&apos;impression. Basé à Montréal. Disponible directement à{' '}
                <a href="mailto:patrick@plio.ca" style={{ color: 'var(--accent-primary)' }}>patrick@plio.ca</a>.
              </p>
            </div>
          </div>
        </section>

        {/* VALUES */}
        <section className="values-section">
          <div className="values-inner">
            <div className="values-head">
              <div className="mission-eyebrow">★ Ce qui nous tient</div>
              <h2>Quatre valeurs <em>non négociables.</em></h2>
            </div>
            <div className="values-grid">
              <div className="value-card">
                <div className="value-icon">✓</div>
                <h3 className="value-title">Honnêteté radicale</h3>
                <p className="value-text">
                  Si ton fichier va mal imprimer, on te le dit. Si on n&apos;est pas le bon
                  partenaire pour ton volume, on te le dit aussi. Pas d&apos;upsell pour
                  l&apos;upsell.
                </p>
              </div>
              <div className="value-card">
                <div className="value-icon">★</div>
                <h3 className="value-title">Excellence artisanale</h3>
                <p className="value-text">
                  On choisit nos papiers, nos finitions et notre presse partenaire comme un
                  imprimeur de quartier choisirait sa propre encre. La rigueur tactile
                  n&apos;est jamais sacrifiée.
                </p>
              </div>
              <div className="value-card">
                <div className="value-icon">$</div>
                <h3 className="value-title">Tarification transparente</h3>
                <p className="value-text">
                  Chaque variable de prix est publique. Le coût unitaire baisse avec la
                  quantité, monte avec les options — toujours en temps réel, jamais en
                  « contactez-nous ».
                </p>
              </div>
              <div className="value-card">
                <div className="value-icon">FR</div>
                <h3 className="value-title">Service en français</h3>
                <p className="value-text">
                  Notre support, nos courriels, nos contrats, notre culture — tout existe
                  nativement en français du Québec. L&apos;anglais aussi, évidemment. Mais le
                  français n&apos;est pas une traduction.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST / CONTACT */}
        <section
          style={{
            maxWidth: 880,
            margin: '64px auto',
            padding: '32px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
          }}
        >
          <div className="mission-eyebrow" style={{ marginBottom: 12 }}>★ Pour nous joindre</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', marginTop: 0 }}>
            Une question avant de commander ?
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, marginTop: 20 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
                Email général
              </div>
              <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)', fontSize: 15, fontWeight: 600 }}>bonjour@plio.ca</a>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Réponse sous 2 h ouvrables</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
                Adresse légale
              </div>
              <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500 }}>Démocratik inc.</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Montréal, QC · Canada</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
                Échantillons
              </div>
              <Link href={'/samples' as Route} style={{ color: 'var(--accent-primary)', fontSize: 15, fontWeight: 600 }}>Demander gratuitement →</Link>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Jusqu&apos;à 5 par mois</div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="cta-section">
          <h2>Prêt à imprimer <em>mieux ?</em></h2>
          <p>Un devis prend 2 minutes. Pas de carte de crédit avant le paiement final.</p>
          <Link href={'/order/start' as Route} className="cta-btn">Démarrer une commande →</Link>
        </div>
      </main>

      <footer>
        <div className="footer-grid">
          <div className="footer-brand">
            <span className="footer-brand-mark">Plio.</span>
            <p className="footer-brand-text">Print wholesale au Canada, devis instantané, livraison partout en 4 à 7 jours.</p>
          </div>
          <div className="footer-col">
            <h4>Entreprise</h4>
            <ul>
              <li><Link href={'/about' as Route}>À propos</Link></li>
              <li><Link href={'/blog' as Route}>Blog</Link></li>
              <li><Link href={'/contact' as Route}>Contact</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Aide</h4>
            <ul>
              <li><Link href={'/help' as Route}>Centre d&apos;aide</Link></li>
              <li><Link href={'/samples' as Route}>Échantillons gratuits</Link></li>
              <li><Link href={'/track' as Route}>Suivre une commande</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Légal</h4>
            <ul>
              <li><Link href={'/legal/terms' as Route}>Conditions d&apos;utilisation</Link></li>
              <li><Link href={'/legal/privacy' as Route}>Confidentialité</Link></li>
              <li><Link href={'/legal/refund-policy' as Route}>Remboursements</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>★ © Plio 2026 · Imprimé au Canada 🇨🇦</span>
          <span>Démocratik inc. · Montréal</span>
        </div>
      </footer>
    </>
  );
}
