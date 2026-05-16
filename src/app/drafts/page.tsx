/**
 * Auto-migrated from Open Design HTML artifact `drafts.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Brouillons — Plio" };

export default function DraftsPage() {
  return (
    <>
      <div className="acct-shell">
          <aside className="acct-nav">
            <div className="acct-nav-brand">Plio.</div>
            <div className="acct-nav-section">Compte</div>
            <ul className="acct-nav-list">
              <li><a href="/orders" className="acct-nav-link">Mes commandes <span className="count">12</span></a></li>
              <li><a href="/drafts" className="acct-nav-link active">Brouillons <span className="count">3</span></a></li>
              <li><a href="/addresses" className="acct-nav-link">Adresses <span className="count">4</span></a></li>
              <li><a href="/wallet" className="acct-nav-link">Portefeuille</a></li>
              <li><a href="#" className="acct-nav-link">Paiements</a></li>
              <li><a href="#" className="acct-nav-link">Codes promo</a></li>
            </ul>
            <div className="acct-nav-section">Outils</div>
            <ul className="acct-nav-list">
              <li><a href="/order/start" className="acct-nav-link">+ Nouvelle commande</a></li>
              <li><a href="/samples" className="acct-nav-link">Demander un échantillon</a></li>
              <li><a href="/templates" className="acct-nav-link">Templates &amp; guides</a></li>
              <li><a href="#" className="acct-nav-link">Devenir reseller</a></li>
            </ul>
            <div className="acct-nav-section">Support</div>
            <ul className="acct-nav-list">
              <li><a href="#" className="acct-nav-link">Aide &amp; FAQ</a></li>
              <li><a href="#" className="acct-nav-link">Contact</a></li>
            </ul>
          </aside>
      
          <main className="acct-main">
            <div className="page-header">
              <div>
                <h1 className="page-title">Brouillons</h1>
                <p className="page-subtitle"><strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>3 devis</strong> en cours · sauvegardés automatiquement · expirent dans 30 jours sans activité</p>
              </div>
            </div>
      
            {/* Info banner */}
            <div className="draft-info-banner">
              <span className="draft-info-banner-icon">💾</span>
              <span>Tes brouillons sont sauvegardés à chaque clic dans le wizard. Reprends exactement où tu en étais — toutes tes options et fichiers sont conservés.</span>
            </div>
      
            {/* Recent drafts */}
            <div className="section-divider">
              <h2 className="section-divider-title">Récents</h2>
              <span className="section-divider-meta">Modifiés cette semaine</span>
            </div>
      
            <div className="drafts-grid">
              {/* Recent draft, step 5 */}
              <a href="/order/upload" className="draft-card recent">
                <div className="draft-thumb"><div className="draft-thumb-card foil"></div></div>
                <div className="draft-info">
                  <div className="draft-info-top">
                    <span className="draft-name">Cartes 16pt + Foil métallique (or)</span>
                    <span className="draft-tag recent">★ Récent</span>
                  </div>
                  <div className="draft-meta">500 unités · 3,5 × 2" · UPS Standard · ~187,60 $</div>
                  <div className="draft-time">Modifié il y a <strong>23 minutes</strong> · à patrick@democratik.org</div>
                </div>
                <div className="draft-progress">
                  <div className="draft-progress-label"><span>Étape</span><strong>5 / 7</strong></div>
                  <div className="draft-progress-bar">
                    <div className="draft-progress-seg done"></div>
                    <div className="draft-progress-seg done"></div>
                    <div className="draft-progress-seg done"></div>
                    <div className="draft-progress-seg done"></div>
                    <div className="draft-progress-seg current"></div>
                    <div className="draft-progress-seg"></div>
                    <div className="draft-progress-seg"></div>
                  </div>
                  <div className="draft-step-label">En attente du fichier verso</div>
                </div>
                <div className="draft-actions">
                  <span className="draft-resume">Reprendre →</span>
                  <span className="draft-menu">⋯</span>
                </div>
              </a>
      
              {/* Step 3 */}
              <a href="/order/configure" className="draft-card">
                <div className="draft-thumb"><div className="draft-thumb-card matte"></div></div>
                <div className="draft-info">
                  <div className="draft-info-top">
                    <span className="draft-name">Brochure 8 pages · pliage roll</span>
                  </div>
                  <div className="draft-meta">300 unités · 8,5 × 11" · UPS Standard · ~312,40 $</div>
                  <div className="draft-time">Modifié il y a <strong>3 jours</strong> · pour Maxime Roy</div>
                </div>
                <div className="draft-progress">
                  <div className="draft-progress-label"><span>Étape</span><strong>3 / 7</strong></div>
                  <div className="draft-progress-bar">
                    <div className="draft-progress-seg done"></div>
                    <div className="draft-progress-seg done"></div>
                    <div className="draft-progress-seg current"></div>
                    <div className="draft-progress-seg"></div>
                    <div className="draft-progress-seg"></div>
                    <div className="draft-progress-seg"></div>
                    <div className="draft-progress-seg"></div>
                  </div>
                  <div className="draft-step-label">Configuration du papier</div>
                </div>
                <div className="draft-actions">
                  <span className="draft-resume">Reprendre →</span>
                  <span className="draft-menu">⋯</span>
                </div>
              </a>
            </div>
      
            {/* Older */}
            <div className="section-divider">
              <h2 className="section-divider-title">Plus anciens</h2>
              <span className="section-divider-meta">Expire bientôt</span>
            </div>
      
            <div className="drafts-grid">
              <a href="/order/quantity" className="draft-card">
                <div className="draft-thumb"><div className="draft-thumb-card empty"></div></div>
                <div className="draft-info">
                  <div className="draft-info-top">
                    <span className="draft-name">Bannière vinyle 3 × 6'</span>
                    <span className="draft-tag expiring">⚠ Expire dans 4 jours</span>
                  </div>
                  <div className="draft-meta">1 unité · vinyle 13oz · prix non calculé</div>
                  <div className="draft-time">Modifié il y a <strong>26 jours</strong> · pour Démocratik</div>
                </div>
                <div className="draft-progress">
                  <div className="draft-progress-label"><span>Étape</span><strong>4 / 7</strong></div>
                  <div className="draft-progress-bar">
                    <div className="draft-progress-seg done"></div>
                    <div className="draft-progress-seg done"></div>
                    <div className="draft-progress-seg done"></div>
                    <div className="draft-progress-seg current"></div>
                    <div className="draft-progress-seg"></div>
                    <div className="draft-progress-seg"></div>
                    <div className="draft-progress-seg"></div>
                  </div>
                  <div className="draft-step-label">Ajustement de la quantité</div>
                </div>
                <div className="draft-actions">
                  <span className="draft-resume">Reprendre →</span>
                  <span className="draft-menu">⋯</span>
                </div>
              </a>
            </div>
          </main>
        </div>
    </>
  );
}
