/**
 * Auto-migrated from Open Design HTML artifact `about.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "L'histoire d'Plio" };

export default function AboutPage() {
  return (
    <>
      <nav className="mkt-nav">
          <a href="/" className="mkt-brand">Plio.</a>
          <div className="mkt-nav-links">
            <a href="/order/start" className="mkt-nav-link">Produits</a>
            <a href="/about" className="mkt-nav-link active">Notre histoire</a>
            <a href="/contact" className="mkt-nav-link">Aide</a>
            <a href="/contact" className="mkt-nav-link">Contact</a>
            <a href="/order/start" className="mkt-nav-cta">Commander →</a>
          </div>
        </nav>
      
        <main>
          {/* HERO */}
          <section className="about-hero">
            <div className="page-eyebrow">Fondée à Montréal · 2026</div>
            <h1>Le print méritait <em>mieux.</em></h1>
            <p>On a passé trop d'années à attendre 3 jours pour un devis. Plio existe pour donner aux pros un accès direct, transparent, instantané à l'impression wholesale canadienne.</p>
          </section>
      
          {/* MISSION */}
          <section className="mission">
            <div>
              <div className="mission-eyebrow">★ Notre mission</div>
              <h2>Pourquoi on a démarré <em>Plio.</em></h2>
              <p>Avant Plio, commander 500 cartes de visite voulait dire <strong>trois courriels, deux relances, 72 heures d'attente</strong> et un PDF de devis rempli de mentions floues. Et quand ton fichier était refusé, personne ne t'expliquait pourquoi — juste « renvoie-le ».</p>
              <p>On a vécu cette douleur trop souvent. Alors on a bâti l'inverse : un <strong>devis instantané</strong> qui change à chaque clic, une <strong>tarification publique</strong> au cent près, et un module de prépresse qui te montre <strong>visuellement</strong> ce qui cloche avant que ça parte sur la presse.</p>
              <p>Plio ne réinvente pas l'impression. On rebrasse l'expérience autour. La presse, c'est Sinalite — un partenaire wholesale canadien établi à Markham. Notre travail à nous, c'est de te faire gagner ton vendredi après-midi.</p>
            </div>
            <div className="mission-visual">
              <div className="mission-stamp">Made in<br />MTL</div>
            </div>
          </section>
      
          {/* STATS */}
          <section className="stats-section">
            <div className="stats-inner">
              <div className="mission-eyebrow">★ Par les chiffres</div>
              <h2>Une équipe petite, des résultats <em>mesurables.</em></h2>
              <div className="stats-grid">
                <div className="stat">
                  <div className="stat-value">12 k<em>+</em></div>
                  <div className="stat-label">Resellers actifs au Canada</div>
                </div>
                <div className="stat">
                  <div className="stat-value">4,9<em>★</em></div>
                  <div className="stat-label">Note moyenne · Trustpilot</div>
                </div>
                <div className="stat">
                  <div className="stat-value">47</div>
                  <div className="stat-label">Commandes par jour en moyenne</div>
                </div>
                <div className="stat">
                  <div className="stat-value">2<em> min</em></div>
                  <div className="stat-label">Pour boucler un devis</div>
                </div>
              </div>
            </div>
          </section>
      
          {/* FOUNDERS */}
          <section className="founders">
            <div className="founders-head">
              <div className="mission-eyebrow">★ Équipe fondatrice</div>
              <h2>Les gens derrière <em>Plio.</em></h2>
              <p>Trois personnes basées à Montréal, avec un bureau ouvert sur le boulevard Saint-Laurent et un téléphone qui sonne en français.</p>
            </div>
            <div className="founders-grid">
              <div className="founder-card">
                <div className="founder-avatar fa-1">PT</div>
                <div className="founder-role">Fondateur · CEO</div>
                <h3 className="founder-name">Patrick Thauvette</h3>
                <p className="founder-bio">Ancien directeur d'un studio de design pendant 12 ans. A perdu trop de samedis à débugger des fichiers PDF refusés. Bâtit le produit que lui-même cherchait.</p>
              </div>
              <div className="founder-card">
                <div className="founder-avatar fa-2">MP</div>
                <div className="founder-role">Direction produit</div>
                <h3 className="founder-name">Marie-Pier Dubois</h3>
                <p className="founder-bio">Vétérane de l'UX en e-commerce (Shopify, Lightspeed). Convaincue qu'un devis devrait être aussi fluide qu'une commande Uber. S'assure que chaque clic mérite d'être là.</p>
              </div>
              <div className="founder-card">
                <div className="founder-avatar fa-3">EG</div>
                <div className="founder-role">CTO · Co-fondateur</div>
                <h3 className="founder-name">Étienne Gagnon</h3>
                <p className="founder-bio">Ingénieur logiciel passé par Hopper et Lightspeed. Maintient l'infrastructure qui fait tourner le pricing engine, le validateur de fichiers et l'intégration Sinalite.</p>
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
                  <p className="value-text">Si ton fichier va mal imprimer, on te le dit. Si on n'est pas le bon partenaire pour ton volume, on te le dit. Pas de upsell qui ne sert pas le client.</p>
                </div>
                <div className="value-card">
                  <div className="value-icon">★</div>
                  <h3 className="value-title">Excellence artisanale</h3>
                  <p className="value-text">On choisit nos papiers, nos finitions et notre presse partenaire comme un imprimeur de quartier choisirait sa propre encre. La rigueur tactile n'est jamais sacrifiée au volume.</p>
                </div>
                <div className="value-card">
                  <div className="value-icon">$</div>
                  <h3 className="value-title">Tarification transparente</h3>
                  <p className="value-text">Chaque variable de prix est publique. Le coût unitaire baisse avec la quantité, monte avec les options — toujours en temps réel, jamais en « contactez-nous ».</p>
                </div>
                <div className="value-card">
                  <div className="value-icon">FR</div>
                  <h3 className="value-title">Service en français</h3>
                  <p className="value-text">Notre support, nos courriels, nos contrats, notre culture — tout existe nativement en français du Québec. L'anglais aussi, évidemment. Mais le français n'est pas une traduction.</p>
                </div>
              </div>
            </div>
          </section>
      
          {/* PRESS */}
          <div className="press-strip">
            <div className="press-label">★ Vu dans</div>
            <div className="press-logos">
              <span className="press-logo">La Presse</span>
              <span className="press-logo">Les Affaires</span>
              <span className="press-logo mono">BETAKIT</span>
              <span className="press-logo">Infopresse</span>
              <span className="press-logo mono">CTECH</span>
              <span className="press-logo">Print Action</span>
            </div>
          </div>
      
          {/* CTA */}
          <div className="cta-section">
            <h2>Prêt à imprimer <em>mieux ?</em></h2>
            <p>Un devis prend 2 minutes. Pas de carte de crédit avant le paiement final.</p>
            <a href="/order/start" className="cta-btn">Démarrer une commande →</a>
          </div>
        </main>
      
        <footer>
          <div className="footer-grid">
            <div className="footer-brand">
              <span className="footer-brand-mark">Plio.</span>
              <p className="footer-brand-text">Print wholesale au Canada, devis instantané, livraison partout en 1 à 7 jours. Imprimé à Markham (ON).</p>
            </div>
            <div className="footer-col">
              <h4>Entreprise</h4>
              <ul>
                <li><a href="/about">Notre histoire</a></li>
                <li><a href="/contact">Contact</a></li>
                <li><a href="#">Carrières</a></li>
                <li><a href="#">Presse</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Aide</h4>
              <ul>
                <li><a href="/contact">Centre d'aide</a></li>
                <li><a href="/contact">Contact</a></li>
                <li><a href="#">Specs techniques</a></li>
                <li><a href="#">Statut système</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Légal</h4>
              <ul>
                <li><a href="/legal/terms">Conditions d'utilisation</a></li>
                <li><a href="/legal/privacy">Confidentialité</a></li>
                <li><a href="/legal/refund-policy">Remboursements</a></li>
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
