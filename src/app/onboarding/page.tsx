/**
 * Auto-migrated from Open Design HTML artifact `onboarding.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Bienvenue — Imprime" };

export default function OnboardingPage() {
  return (
    <>
      <div className="onb">
          {/* HEADER */}
          <header className="onb-header">
            <div className="onb-header-left">★ Bienvenue · session #001</div>
            <span className="wordmark">Imprime.</span>
            <a href="orders.html" className="onb-skip">Skip le tour →</a>
          </header>
      
          {/* MAIN */}
          <main className="onb-main">
            <div>
              {/* HERO */}
              <section className="hero">
                <div className="hero-eyebrow">Compte créé · 14 mai 2026</div>
                <h1 className="hero-title">Bienvenue,<br /><em>Patrick.</em></h1>
                <p className="hero-sub">On a 4 trucs à te montrer avant de partir imprimer. Promis, c'est rapide — et tu peux skipper à tout moment.</p>
                <div className="dot-progress">
                  <div className="dot-row">
                    <span className="dot filled"></span>
                    <span className="dot outline"></span>
                    <span className="dot outline"></span>
                    <span className="dot outline"></span>
                  </div>
                  <span className="dot-label">Étape 1 sur 4 · 30 secondes au total</span>
                </div>
              </section>
      
              {/* STEPS */}
              <section className="steps">
                {/* Step 1 : actif */}
                <article className="step-card active">
                  <div className="step-card-eyebrow">
                    <span className="num">Étape 01</span>
                    <span className="sep">·</span>
                    <span>Le produit</span>
                  </div>
                  <h2 className="step-card-title">Choisis ce que <em>t'imprimes.</em></h2>
                  <p className="step-card-body">8 familles de produits, plus de 1 200 SKU sous-jacents. Du classique (carte de visite 14pt) au plus niche (étiquette die-cut sur BOPP). Survole pour explorer.</p>
      
                  <div className="prod-row">
                    <div className="prod-tile">
                      <svg className="prod-icon" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                      <span className="prod-label">Cartes</span>
                    </div>
                    <div className="prod-tile">
                      <svg className="prod-icon" viewBox="0 0 24 24"><path d="M21 5L2 12.5l7 1.5L18 8l-6 9 1.5 4z" /></svg>
                      <span className="prod-label">Flyers</span>
                    </div>
                    <div className="prod-tile">
                      <svg className="prod-icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      <span className="prod-label">Postcards</span>
                    </div>
                    <div className="prod-tile">
                      <svg className="prod-icon" viewBox="0 0 24 24"><path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" /></svg>
                      <span className="prod-label">Brochures</span>
                    </div>
                    <div className="prod-tile">
                      <svg className="prod-icon" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="1" /><line x1="2" y1="20" x2="22" y2="20" /><line x1="6" y1="17" x2="6" y2="20" /><line x1="18" y1="17" x2="18" y2="20" /></svg>
                      <span className="prod-label">Bannières</span>
                    </div>
                    <div className="prod-tile">
                      <svg className="prod-icon" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1.5" fill="currentColor" /></svg>
                      <span className="prod-label">Étiquettes</span>
                    </div>
                    <div className="prod-tile">
                      <svg className="prod-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="9" y1="13" x2="15" y2="13" /></svg>
                      <span className="prod-label">Stationnerie</span>
                    </div>
                    <div className="prod-tile">
                      <svg className="prod-icon" viewBox="0 0 24 24"><path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></svg>
                      <span className="prod-label">Apparel</span>
                    </div>
                  </div>
      
                  <div className="step-card-actions">
                    <a href="configure.html" className="btn btn-primary">Démarrer avec une carte de visite →</a>
                    <a href="welcome.html" className="btn btn-ghost">Explorer le catalogue complet</a>
                  </div>
                </article>
      
                {/* Step 2 : preview */}
                <article className="step-card preview">
                  <div className="step-card-eyebrow">
                    <span className="num">Étape 02</span>
                    <span className="sep">·</span>
                    <span>Design ou upload</span>
                  </div>
                  <h2 className="step-card-title">Design en 30 secondes<br />ou <em>téléverse</em> ton PDF.</h2>
                  <p className="step-card-body">Deux chemins, zéro friction. Pioche dans 80+ templates pro et personnalise dans l'éditeur live, ou drop ton PDF print-ready et on s'occupe du préflight (CMYK, bleed, résolution).</p>
                  <div className="step-card-meta">
                    <span className="step-meta-pill"><span className="dot-s"></span>Éditeur live · update temps réel</span>
                    <span className="step-meta-pill"><span className="dot-s"></span>Préflight auto · CMYK + 300 DPI</span>
                  </div>
                </article>
      
                {/* Step 3 : preview faded */}
                <article className="step-card preview faded-2">
                  <div className="step-card-eyebrow">
                    <span className="num">Étape 03</span>
                    <span className="sep">·</span>
                    <span>Prix live</span>
                  </div>
                  <h2 className="step-card-title">Vois le prix qui <em>bouge</em> en temps réel.</h2>
                  <p className="step-card-body">Change le format, le grammage, la quantité — le devis se recalcule à la milliseconde. Pas de surprise au checkout, pas de "frais cachés", pas d'abonnement.</p>
                </article>
      
                {/* Step 4 : preview faded */}
                <article className="step-card preview faded-3">
                  <div className="step-card-eyebrow">
                    <span className="num">Étape 04</span>
                    <span className="sep">·</span>
                    <span>Livraison</span>
                  </div>
                  <h2 className="step-card-title">Reçois-le partout au Canada en <em>1 à 7 jours.</em></h2>
                  <p className="step-card-body">Production démarre dans l'heure suivant la validation du fichier. Tracking Postes Canada + Purolator, signature digitale, retours gratuits sous 14 jours.</p>
                </article>
              </section>
      
              {/* FINAL CTA */}
              <section className="cta-block">
                <div className="cta-eyebrow">★ Prêt à imprimer ?</div>
                <h2 className="cta-title">Lance ta <em>première commande.</em></h2>
                <p className="cta-sub">Tu peux toujours revenir au tour plus tard. Et le premier échantillon est offert — sans engagement.</p>
                <div className="cta-buttons">
                  <a href="welcome.html" className="btn btn-primary btn-lg">Démarrer une commande →</a>
                  <a href="templates.html" className="btn btn-secondary btn-lg">Explorer les templates</a>
                </div>
              </section>
            </div>
      
            {/* ASIDE */}
            <aside className="onb-aside">
              <div className="trust-block">
                <div className="trust-label">Pourquoi Imprime</div>
                <div className="stats-grid">
                  <div className="stat">
                    <span className="stat-num">12k+</span>
                    <span className="stat-text">resellers actifs au Canada</span>
                  </div>
                  <div className="stat">
                    <span className="stat-num">4,9★</span>
                    <span className="stat-text">Trustpilot · 12 482 avis</span>
                  </div>
                  <div className="stat">
                    <span className="stat-num">2 min</span>
                    <span className="stat-text">devis moyen, du clic à la commande</span>
                  </div>
                  <div className="stat">
                    <span className="stat-num">100%</span>
                    <span className="stat-text">imprimé au Canada — Montréal &amp; Vancouver</span>
                  </div>
                </div>
              </div>
      
              <div className="trust-block">
                <div className="trust-label">Tes avantages dès aujourd'hui</div>
                <ul className="benefit-list">
                  <li className="benefit-row"><span><strong>Échantillons gratuits</strong> — un par stock, livré en 3 jours.</span></li>
                  <li className="benefit-row"><span><strong>Sans abonnement</strong> — tu paies seulement ce que tu imprimes.</span></li>
                  <li className="benefit-row"><span><strong>Prix wholesale</strong> dès la première commande, pas après 10.</span></li>
                  <li className="benefit-row"><span><strong>Support FR-CA</strong> en moins de 2h, par humain, du lundi au samedi.</span></li>
                </ul>
              </div>
            </aside>
          </main>
      
          {/* FOOTER */}
          <footer className="onb-footer">
            Tu peux toujours revenir ici via <a href="#">Aide → Re-faire le tour</a>.
          </footer>
        </div>
    </>
  );
}
