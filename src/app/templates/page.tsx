/**
 * Auto-migrated from Open Design HTML artifact `templates.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Templates & guides — Imprime" };

export default function TemplatesPage() {
  return (
    <>
      <div className="acct-shell">
          <aside className="acct-nav">
            <div className="acct-nav-brand">Imprime.</div>
            <div className="acct-nav-section">Compte</div>
            <ul className="acct-nav-list">
              <li><a href="/orders" className="acct-nav-link">Mes commandes <span className="count">12</span></a></li>
              <li><a href="/drafts" className="acct-nav-link">Brouillons <span className="count">3</span></a></li>
              <li><a href="/addresses" className="acct-nav-link">Adresses <span className="count">4</span></a></li>
              <li><a href="/wallet" className="acct-nav-link">Portefeuille</a></li>
              <li><a href="#" className="acct-nav-link">Paiements</a></li>
              <li><a href="#" className="acct-nav-link">Codes promo</a></li>
            </ul>
            <div className="acct-nav-section">Outils</div>
            <ul className="acct-nav-list">
              <li><a href="/order/start" className="acct-nav-link">+ Nouvelle commande</a></li>
              <li><a href="/samples" className="acct-nav-link">Demander un échantillon</a></li>
              <li><a href="/templates" className="acct-nav-link active">Templates &amp; guides</a></li>
              <li><a href="#" className="acct-nav-link">Devenir reseller</a></li>
            </ul>
            <div className="acct-nav-section">Support</div>
            <ul className="acct-nav-list">
              <li><a href="#" className="acct-nav-link">Aide &amp; FAQ</a></li>
              <li><a href="#" className="acct-nav-link">Contact</a></li>
            </ul>
          </aside>
      
          <main className="acct-main">
            <div className="page-eyebrow">Téléchargements gratuits</div>
            <h1 className="page-title">Templates &amp; <em>guides print.</em></h1>
            <p className="page-lede">Bleed et safe zone configurés, formats vectoriels prêts à l'emploi. Tout est gratuit, sans inscription, sans watermark.</p>
      
            {/* Search */}
            <div className="tpl-search">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input type="text" placeholder="Cherche un format ou un produit…" />
              <span className="tpl-search-kbd">/</span>
            </div>
      
            {/* Filters */}
            <div className="tpl-filters">
              <div className="tpl-filter active">Tous</div>
              <div className="tpl-filter">Cartes</div>
              <div className="tpl-filter">Flyers</div>
              <div className="tpl-filter">Postcards</div>
              <div className="tpl-filter">Brochures</div>
              <div className="tpl-filter">Bannières</div>
              <div className="tpl-filter">Étiquettes</div>
              <div className="tpl-filter">Apparel</div>
            </div>
      
            {/* Templates section */}
            <div className="section-header">
              <h2 className="section-header-title">Templates les plus téléchargés</h2>
              <span className="section-header-meta">Mis à jour 12 mai 2026</span>
            </div>
      
            <div className="tpl-grid">
              <div className="tpl-card">
                <div className="tpl-preview">
                  <div className="tpl-preview-card bc"></div>
                  <span className="tpl-format-badge">3,5 × 2"</span>
                  <span className="tpl-popular">★ Top</span>
                </div>
                <div className="tpl-body">
                  <div className="tpl-name">Carte de visite — horizontal</div>
                  <div className="tpl-meta">Standard NA · CMYK · 300 DPI</div>
                  <div className="tpl-bottom">
                    <div className="tpl-formats"><span className="tpl-format">.AI</span><span className="tpl-format">.PSD</span><span className="tpl-format">.PDF</span><span className="tpl-format">.IDML</span></div>
                    <div className="tpl-download"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></div>
                  </div>
                </div>
              </div>
      
              <div className="tpl-card">
                <div className="tpl-preview">
                  <div className="tpl-preview-card bc-vert"></div>
                  <span className="tpl-format-badge">2 × 3,5"</span>
                </div>
                <div className="tpl-body">
                  <div className="tpl-name">Carte de visite — vertical</div>
                  <div className="tpl-meta">Format portrait · CMYK</div>
                  <div className="tpl-bottom">
                    <div className="tpl-formats"><span className="tpl-format">.AI</span><span className="tpl-format">.PSD</span><span className="tpl-format">.PDF</span></div>
                    <div className="tpl-download"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></div>
                  </div>
                </div>
              </div>
      
              <div className="tpl-card">
                <div className="tpl-preview">
                  <div className="tpl-preview-card flyer"></div>
                  <span className="tpl-format-badge">8,5 × 11"</span>
                  <span className="tpl-popular">★ Top</span>
                </div>
                <div className="tpl-body">
                  <div className="tpl-name">Flyer Letter</div>
                  <div className="tpl-meta">Recto-verso · marges 0,25"</div>
                  <div className="tpl-bottom">
                    <div className="tpl-formats"><span className="tpl-format">.AI</span><span className="tpl-format">.PSD</span><span className="tpl-format">.PDF</span><span className="tpl-format">.IDML</span></div>
                    <div className="tpl-download"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></div>
                  </div>
                </div>
              </div>
      
              <div className="tpl-card">
                <div className="tpl-preview">
                  <div className="tpl-preview-card postcard"></div>
                  <span className="tpl-format-badge">4 × 6"</span>
                </div>
                <div className="tpl-body">
                  <div className="tpl-name">Carte postale standard</div>
                  <div className="tpl-meta">Postes Canada compatible</div>
                  <div className="tpl-bottom">
                    <div className="tpl-formats"><span className="tpl-format">.AI</span><span className="tpl-format">.PSD</span><span className="tpl-format">.PDF</span></div>
                    <div className="tpl-download"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></div>
                  </div>
                </div>
              </div>
      
              <div className="tpl-card">
                <div className="tpl-preview">
                  <div className="tpl-preview-card brochure"></div>
                  <span className="tpl-format-badge">11 × 8,5" · 3 plis</span>
                </div>
                <div className="tpl-body">
                  <div className="tpl-name">Brochure 3 plis (tri-fold)</div>
                  <div className="tpl-meta">Pliage roll-fold · 6 panneaux</div>
                  <div className="tpl-bottom">
                    <div className="tpl-formats"><span className="tpl-format">.AI</span><span className="tpl-format">.PSD</span><span className="tpl-format">.PDF</span><span className="tpl-format">.IDML</span></div>
                    <div className="tpl-download"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></div>
                  </div>
                </div>
              </div>
      
              <div className="tpl-card">
                <div className="tpl-preview">
                  <div className="tpl-preview-card banner"></div>
                  <span className="tpl-format-badge">3 × 6'</span>
                </div>
                <div className="tpl-body">
                  <div className="tpl-name">Bannière vinyle horizontale</div>
                  <div className="tpl-meta">Échelle 1:10 · vectoriel requis</div>
                  <div className="tpl-bottom">
                    <div className="tpl-formats"><span className="tpl-format">.AI</span><span className="tpl-format">.PDF</span></div>
                    <div className="tpl-download"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></div>
                  </div>
                </div>
              </div>
      
              <div className="tpl-card">
                <div className="tpl-preview">
                  <div className="tpl-preview-card label"></div>
                  <span className="tpl-format-badge">Ø 2"</span>
                </div>
                <div className="tpl-body">
                  <div className="tpl-name">Étiquette ronde</div>
                  <div className="tpl-meta">Roll label · BOPP gloss</div>
                  <div className="tpl-bottom">
                    <div className="tpl-formats"><span className="tpl-format">.AI</span><span className="tpl-format">.PDF</span></div>
                    <div className="tpl-download"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></div>
                  </div>
                </div>
              </div>
      
              <div className="tpl-card">
                <div className="tpl-preview">
                  <div className="tpl-preview-card tshirt"></div>
                  <span className="tpl-format-badge">12 × 14" zone</span>
                </div>
                <div className="tpl-body">
                  <div className="tpl-name">T-shirt — zone d'impression</div>
                  <div className="tpl-meta">DTG · positionnement avant</div>
                  <div className="tpl-bottom">
                    <div className="tpl-formats"><span className="tpl-format">.AI</span><span className="tpl-format">.PSD</span></div>
                    <div className="tpl-download"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></div>
                  </div>
                </div>
              </div>
            </div>
      
            {/* Legend */}
            <div className="tpl-legend">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: "600" } as React.CSSProperties}>★ LÉGENDE</span>
              <span className="tpl-legend-dot bleed">Zone de bleed (0,125")</span>
              <span className="tpl-legend-dot safe">Safe zone (texte/logos)</span>
            </div>
      
            {/* Guides section */}
            <div className="section-header" style={{ marginTop: "56px" } as React.CSSProperties}>
              <h2 className="section-header-title">Guides &amp; tutoriels</h2>
              <span className="section-header-meta">Lecture 5 min en moyenne</span>
            </div>
      
            <div className="guides-grid">
              <a href="#" className="guide-card">
                <div className="guide-eyebrow">★ Fondamentaux</div>
                <h3 className="guide-title">CMYK vs RGB — pourquoi ça change tout en print</h3>
                <p className="guide-text">Le rouge éclatant de ton écran devient mat à l'impression. Apprends à convertir tes designs sans perdre l'impact.</p>
                <div className="guide-meta"><span>Lecture 4 min</span><strong>Lire →</strong></div>
              </a>
              <a href="#" className="guide-card">
                <div className="guide-eyebrow">★ Préflight</div>
                <h3 className="guide-title">Bleed, trim et safe zone — le triangle d'or</h3>
                <p className="guide-text">Comprends pourquoi 0,125" de bleed sauve ton design des bords blancs et comment éviter de couper ton logo.</p>
                <div className="guide-meta"><span>Lecture 6 min</span><strong>Lire →</strong></div>
              </a>
              <a href="#" className="guide-card">
                <div className="guide-eyebrow">★ Papier</div>
                <h3 className="guide-title">14pt vs 16pt vs 18pt — quel grammage choisir ?</h3>
                <p className="guide-text">Du standard économique au velouté premium, on décortique chaque option avec photos macro et cas d'usage.</p>
                <div className="guide-meta"><span>Lecture 8 min</span><strong>Lire →</strong></div>
              </a>
            </div>
          </main>
        </div>
    </>
  );
}
