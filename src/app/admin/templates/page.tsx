/**
 * Auto-migrated from Open Design HTML artifact `admin-templates.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Admin — Templates" };

export default function AdminTemplates() {
  return (
    <>
      <div className="adm-shell">
      
          {/* ─── ADMIN SIDEBAR (identical to dashboard, active = Templates) ─ */}
          <aside className="adm-nav">
            <div className="adm-nav-brand">
              <span className="adm-nav-brand-mark">Plio.</span>
              <span className="adm-nav-brand-tag">Admin</span>
            </div>
      
            <div className="adm-nav-section">Opérations</div>
            <ul className="adm-nav-list">
              <li><a href="admin-dashboard.html" className="adm-nav-link">
                <span className="adm-nav-link-text">
                  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" /></svg>
                  Tableau de bord
                </span>
              </a></li>
              <li><a href="admin-orders.html" className="adm-nav-link">
                <span className="adm-nav-link-text">
                  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12v9H2zM2 7h12M5 10h2" /></svg>
                  Commandes
                </span>
                <span className="adm-nav-count">142</span>
              </a></li>
              <li><a href="admin-webhooks.html" className="adm-nav-link">
                <span className="adm-nav-link-text">
                  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="8" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="12" cy="12" r="2" /><path d="M5.8 7.2L10.4 5M5.8 8.8L10.4 11" /></svg>
                  Webhooks
                </span>
                <span className="adm-nav-count urgent">3</span>
              </a></li>
            </ul>
      
            <div className="adm-nav-section">Catalogue</div>
            <ul className="adm-nav-list">
              <li><a href="admin-templates.html" className="adm-nav-link active">
                <span className="adm-nav-link-text">
                  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 6h12M5 9h6M5 11h4" /></svg>
                  Templates
                </span>
                <span className="adm-nav-count">3</span>
              </a></li>
              <li><a href="admin-products.html" className="adm-nav-link">
                <span className="adm-nav-link-text">
                  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5l5-3 5 3v6l-5 3-5-3zM3 5l5 3 5-3M8 8v6" /></svg>
                  Produits Sinalite
                </span>
                <span className="adm-nav-count">468</span>
              </a></li>
            </ul>
      
            <div className="adm-nav-section">Audience</div>
            <ul className="adm-nav-list">
              <li><a href="admin-users.html" className="adm-nav-link">
                <span className="adm-nav-link-text">
                  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="5" r="2.5" /><path d="M3 13c0-2.5 2.5-4 5-4s5 1.5 5 4" /></svg>
                  Utilisateurs
                </span>
                <span className="adm-nav-count">218</span>
              </a></li>
            </ul>
      
            <div className="adm-nav-section">Finance</div>
            <ul className="adm-nav-list">
              <li><a href="admin-finances.html" className="adm-nav-link">
                <span className="adm-nav-link-text">
                  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12V4M5 12V7M8 12V5M11 12V8M14 12V3" /></svg>
                  Finances
                </span>
              </a></li>
            </ul>
      
            <div className="adm-nav-section">Système</div>
            <ul className="adm-nav-list">
              <li><a href="#" className="adm-nav-link">
                <span className="adm-nav-link-text">
                  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2.5" /><path d="M8 2v2M8 12v2M14 8h-2M4 8H2M12.2 3.8l-1.4 1.4M5.2 10.8l-1.4 1.4M12.2 12.2l-1.4-1.4M5.2 5.2L3.8 3.8" /></svg>
                  Réglages
                </span>
              </a></li>
            </ul>
      
            <div className="adm-nav-user">
              <div className="adm-nav-user-avatar">PT</div>
              <div className="adm-nav-user-info">
                <div className="adm-nav-user-name">Patrick Thauvette</div>
                <div className="adm-nav-user-role">Owner · ★★★</div>
              </div>
            </div>
          </aside>
      
          {/* ─── MAIN ──────────────────────────────────────────────────── */}
          <main className="adm-main">
      
            <header className="adm-topbar">
              <div>
                <h1 className="adm-page-title">Templates</h1>
                <p className="adm-page-subtitle">3 publiés · 0 brouillon · 247 designs créés ce mois-ci</p>
              </div>
              <div className="adm-topbar-actions">
                <button className="btn btn-secondary btn-sm">↗ Importer JSON</button>
                <button className="btn btn-secondary btn-sm">Réordonner</button>
                <button className="btn btn-primary btn-sm">+ Nouveau template</button>
              </div>
            </header>
      
            {/* Filter pills */}
            <div className="adm-pills">
              <button className="adm-pill active">Tous <span className="adm-pill-count">5</span></button>
              <button className="adm-pill">Cartes de visite <span className="adm-pill-count">3</span></button>
              <button className="adm-pill">Flyers <span className="adm-pill-count">0</span></button>
              <button className="adm-pill">Postcards <span className="adm-pill-count">0</span></button>
              <button className="adm-pill">Brochures <span className="adm-pill-count">0</span></button>
              <button className="adm-pill">Brouillons <span className="adm-pill-count">2</span></button>
              <button className="adm-pill">Archived <span className="adm-pill-count">0</span></button>
            </div>
      
            {/* Mini stats */}
            <section className="adm-stats">
              <div className="adm-stat-card">
                <div className="adm-stat-label">Designs créés — 30 j</div>
                <div className="adm-stat-value">247<span className="unit">designs</span></div>
                <div className="adm-stat-detail">↑ 42 vs 30 j précédents · <strong>8,2 / jour</strong></div>
              </div>
              <div className="adm-stat-card">
                <div className="adm-stat-label">Top performer</div>
                <div className="adm-stat-value">142<span className="unit">designs</span></div>
                <div className="adm-stat-detail"><strong>Bloc accent</strong> · 57 % du volume</div>
              </div>
              <div className="adm-stat-card">
                <div className="adm-stat-label">Conversion design → order</div>
                <div className="adm-stat-value">71<span className="unit">%</span></div>
                <div className="adm-stat-detail">175 orders sur 247 designs · panier moy. <strong>184 $</strong></div>
              </div>
              <div className="adm-stat-card">
                <div className="adm-stat-label">Templates les plus utilisés</div>
                <div className="adm-stat-value">3<span className="unit">/ 3 actifs</span></div>
                <div className="adm-stat-detail">Aucun template inutilisé · <strong>tous performants</strong></div>
              </div>
            </section>
      
            {/* Section: published */}
            <div className="adm-section-head">
              <h2 className="adm-section-title">Publiés <span className="count">3 actifs</span></h2>
              <span className="adm-section-meta">Trier : Plus utilisés ↓</span>
            </div>
      
            {/* Template grid */}
            <section className="adm-tpl-grid">
      
              {/* 1. Minimal noir & blanc */}
              <article className="adm-tpl-card">
                <div className="adm-tpl-thumb">
                  <span className="badge badge-success adm-tpl-thumb-badge">★ Top</span>
                  <span className="adm-tpl-thumb-status">Publié</span>
                  <div className="adm-tpl-thumb-card var-minimal">
                    <p className="nm">Sophie Beauchamp</p>
                    <p className="ti">Directrice créative</p>
                    <div className="div"></div>
                    <p className="det">sophie@studio.ca<br/>+1 514 555 0182</p>
                  </div>
                </div>
                <div className="adm-tpl-body">
                  <div className="adm-tpl-head">
                    <div>
                      <h3 className="adm-tpl-name">Minimal — noir & blanc</h3>
                      <div className="adm-tpl-slug">bc-minimal-bw · v1.4</div>
                    </div>
                    <div className="adm-tpl-meta">
                      <span className="badge badge-accent">Carte de visite</span>
                    </div>
                  </div>
                  <div className="adm-tpl-stats">
                    <strong>87 designs</strong> créés · <strong>62 commandes</strong> · <strong>71 %</strong> conversion
                  </div>
                </div>
                <div className="adm-tpl-foot">
                  <a href="admin-template-editor.html" className="adm-tpl-edit-link">→ Éditer</a>
                  <div className="adm-tpl-menu">
                    <button className="adm-tpl-menu-btn" title="Aperçu">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn" title="Dupliquer">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1" /><path d="M2 11V3a1 1 0 011-1h8" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn" title="Archiver">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="3" /><rect x="3" y="6" width="10" height="8" /><path d="M6 9h4" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn danger" title="Supprimer">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10" /></svg>
                    </button>
                  </div>
                </div>
              </article>
      
              {/* 2. Bloc accent vert forêt */}
              <article className="adm-tpl-card">
                <div className="adm-tpl-thumb">
                  <span className="badge badge-success adm-tpl-thumb-badge">★ Top</span>
                  <span className="adm-tpl-thumb-status">Publié</span>
                  <div className="adm-tpl-thumb-card var-accent">
                    <div className="inner">
                      <p className="nm">Maxime Roy</p>
                      <p className="ti">Architecte paysagiste</p>
                      <p className="det">maxime@roy.studio<br/>+1 438 555 0294</p>
                    </div>
                  </div>
                </div>
                <div className="adm-tpl-body">
                  <div className="adm-tpl-head">
                    <div>
                      <h3 className="adm-tpl-name">Bloc accent vert forêt</h3>
                      <div className="adm-tpl-slug">bc-accent-block · v2.1</div>
                    </div>
                    <div className="adm-tpl-meta">
                      <span className="badge badge-accent">Carte de visite</span>
                    </div>
                  </div>
                  <div className="adm-tpl-stats">
                    <strong>142 designs</strong> créés · <strong>104 commandes</strong> · <strong>73 %</strong> conversion
                  </div>
                </div>
                <div className="adm-tpl-foot">
                  <a href="admin-template-editor.html" className="adm-tpl-edit-link">→ Éditer</a>
                  <div className="adm-tpl-menu">
                    <button className="adm-tpl-menu-btn" title="Aperçu">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn" title="Dupliquer">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1" /><path d="M2 11V3a1 1 0 011-1h8" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn" title="Archiver">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="3" /><rect x="3" y="6" width="10" height="8" /><path d="M6 9h4" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn danger" title="Supprimer">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10" /></svg>
                    </button>
                  </div>
                </div>
              </article>
      
              {/* 3. Editorial serif */}
              <article className="adm-tpl-card">
                <div className="adm-tpl-thumb">
                  <span className="adm-tpl-thumb-status">Publié</span>
                  <div className="adm-tpl-thumb-card var-editorial">
                    <p className="nm">Marguerite<br/>Dubois</p>
                    <p className="ti">Curatrice — Galerie Saint-Vallier</p>
                    <div className="div"></div>
                    <p className="det">marguerite@galerie-sv.qc<br/>+1 418 555 0166</p>
                  </div>
                </div>
                <div className="adm-tpl-body">
                  <div className="adm-tpl-head">
                    <div>
                      <h3 className="adm-tpl-name">Editorial — serif</h3>
                      <div className="adm-tpl-slug">bc-editorial · v1.0</div>
                    </div>
                    <div className="adm-tpl-meta">
                      <span className="badge badge-accent">Carte de visite</span>
                    </div>
                  </div>
                  <div className="adm-tpl-stats">
                    <strong>18 designs</strong> créés · <strong>9 commandes</strong> · <strong>50 %</strong> conversion
                  </div>
                </div>
                <div className="adm-tpl-foot">
                  <a href="admin-template-editor.html" className="adm-tpl-edit-link">→ Éditer</a>
                  <div className="adm-tpl-menu">
                    <button className="adm-tpl-menu-btn" title="Aperçu">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn" title="Dupliquer">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1" /><path d="M2 11V3a1 1 0 011-1h8" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn" title="Archiver">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="3" /><rect x="3" y="6" width="10" height="8" /><path d="M6 9h4" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn danger" title="Supprimer">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10" /></svg>
                    </button>
                  </div>
                </div>
              </article>
      
            </section>
      
            {/* Section: drafts */}
            <div className="adm-section-head">
              <h2 className="adm-section-title">Brouillons <span className="count">2 en cours</span></h2>
              <span className="adm-section-meta">Non-publiés · invisible côté client</span>
            </div>
      
            <section className="adm-tpl-grid">
      
              {/* Draft 1 */}
              <article className="adm-tpl-card adm-tpl-card-draft">
                <div className="adm-tpl-thumb">
                  <span className="adm-tpl-thumb-status" style={{ background: "rgba(180, 95, 31, 0.85)" } as React.CSSProperties}>Brouillon</span>
                  <div className="adm-tpl-thumb-empty">
                    <div className="adm-tpl-thumb-empty-ico">⊕</div>
                    <div className="adm-tpl-thumb-empty-text">Pas encore d'aperçu</div>
                  </div>
                </div>
                <div className="adm-tpl-body">
                  <div className="adm-tpl-head">
                    <div>
                      <h3 className="adm-tpl-name">Flyer événement — pleine page</h3>
                      <div className="adm-tpl-slug">fl-event-fullpage · v0.3</div>
                    </div>
                    <div className="adm-tpl-meta">
                      <span className="badge badge-warning">Flyer</span>
                    </div>
                  </div>
                  <div className="adm-tpl-stats">
                    <strong>4 / 8</strong> champs définis · grille en cours · schéma non validé
                  </div>
                </div>
                <div className="adm-tpl-foot">
                  <a href="admin-template-editor.html" className="adm-tpl-edit-link">→ Continuer</a>
                  <div className="adm-tpl-menu">
                    <button className="adm-tpl-menu-btn" title="Dupliquer">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1" /><path d="M2 11V3a1 1 0 011-1h8" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn danger" title="Supprimer">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10" /></svg>
                    </button>
                  </div>
                </div>
              </article>
      
              {/* Draft 2 */}
              <article className="adm-tpl-card adm-tpl-card-draft">
                <div className="adm-tpl-thumb">
                  <span className="adm-tpl-thumb-status" style={{ background: "rgba(180, 95, 31, 0.85)" } as React.CSSProperties}>Brouillon</span>
                  <div className="adm-tpl-thumb-empty">
                    <div className="adm-tpl-thumb-empty-ico">⊕</div>
                    <div className="adm-tpl-thumb-empty-text">Pas encore d'aperçu</div>
                  </div>
                </div>
                <div className="adm-tpl-body">
                  <div className="adm-tpl-head">
                    <div>
                      <h3 className="adm-tpl-name">Postcard 5×7 — recto verso</h3>
                      <div className="adm-tpl-slug">pc-5x7-duplex · v0.1</div>
                    </div>
                    <div className="adm-tpl-meta">
                      <span className="badge badge-warning">Postcard</span>
                    </div>
                  </div>
                  <div className="adm-tpl-stats">
                    <strong>1 / 6</strong> champs définis · canvas vierge
                  </div>
                </div>
                <div className="adm-tpl-foot">
                  <a href="admin-template-editor.html" className="adm-tpl-edit-link">→ Continuer</a>
                  <div className="adm-tpl-menu">
                    <button className="adm-tpl-menu-btn" title="Dupliquer">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1" /><path d="M2 11V3a1 1 0 011-1h8" /></svg>
                    </button>
                    <button className="adm-tpl-menu-btn danger" title="Supprimer">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M6 4V2h4v2M5 4l1 10h4l1-10" /></svg>
                    </button>
                  </div>
                </div>
              </article>
      
            </section>
      
          </main>
        </div>
    </>
  );
}
