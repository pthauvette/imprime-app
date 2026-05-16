/**
 * Auto-migrated from Open Design HTML artifact `admin-users.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Admin — Utilisateurs" };

export default function AdminUsers() {
  return (
    <>
      <div className="adm-shell">
      
          {/* ─── SIDEBAR ───────────────────────────────────────────────── */}
          <aside className="adm-nav">
            <div className="adm-nav-brand">
              <span className="adm-nav-brand-mark">Imprime.</span>
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
              <li><a href="admin-templates.html" className="adm-nav-link">
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
              <li><a href="admin-users.html" className="adm-nav-link active">
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
                <h1 className="adm-page-title">Utilisateurs</h1>
                <p className="adm-page-subtitle">218 inscrits · 142 avec commandes · 76 guest</p>
              </div>
              <div className="adm-topbar-actions">
                <button className="btn btn-secondary btn-sm">↓ Exporter CSV</button>
                <button className="btn btn-primary btn-sm">+ Inviter utilisateur</button>
              </div>
            </header>
      
            {/* ─── Stats ───────────────────────────────────────────────── */}
            <section className="usr-stats">
              <div className="usr-stat">
                <div className="usr-stat-label">Total inscrits</div>
                <div className="usr-stat-value">218<span className="unit">comptes</span></div>
                <div className="usr-stat-meta up">↑ 12 nouveaux · 7 j</div>
              </div>
              <div className="usr-stat">
                <div className="usr-stat-label">Avec commandes</div>
                <div className="usr-stat-value">142<span className="unit">acheteurs</span></div>
                <div className="usr-stat-meta">Taux conv. 65 %</div>
              </div>
              <div className="usr-stat">
                <div className="usr-stat-label">Guest checkout</div>
                <div className="usr-stat-value">76<span className="unit">non-claimed</span></div>
                <div className="usr-stat-meta">3 en attente · 7 j</div>
              </div>
              <div className="usr-stat">
                <div className="usr-stat-label">Nouveaux · 7 j</div>
                <div className="usr-stat-value">12<span className="unit">inscriptions</span></div>
                <div className="usr-stat-meta up">↑ +4 vs semaine précédente</div>
              </div>
            </section>
      
            {/* ─── Filter bar ──────────────────────────────────────────── */}
            <div className="usr-filterbar">
              <div className="usr-pills">
                <button className="usr-pill active">Tous <span className="usr-pill-count">218</span></button>
                <button className="usr-pill">Authentifiés <span className="usr-pill-count">142</span></button>
                <button className="usr-pill">Guest <span className="usr-pill-count">76</span></button>
                <button className="usr-pill">High-value <span className="usr-pill-count">18</span></button>
                <button className="usr-pill">Inactifs 90j+ <span className="usr-pill-count">44</span></button>
              </div>
              <div className="usr-search">
                <svg className="usr-search-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" /></svg>
                <input type="text" placeholder="Cherche par nom, email, ID Stripe..." />
                <span className="usr-search-kbd">⌘K</span>
              </div>
            </div>
      
            {/* ─── Table ───────────────────────────────────────────────── */}
            <div className="usr-panel">
              <table className="usr-table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th className="sortable">Inscrit le</th>
                    <th className="sortable" style={{ textAlign: "right" } as React.CSSProperties}>Commandes</th>
                    <th className="sortable sorted" style={{ textAlign: "right" } as React.CSSProperties}>LTV ▾</th>
                    <th className="sortable">Dernière commande</th>
                    <th>Status auth</th>
                    <th>Province</th>
                    <th className="actions-col"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a1">SB</div>
                        <div>
                          <div className="name">Sophie Beauchamp</div>
                          <div className="email">sophie@boreal.studio</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">14 fév 2026</td>
                    <td className="usr-orders">7</td>
                    <td className="usr-ltv high">1 847 $</td>
                    <td className="usr-date">16 mai · 14:32</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Montréal <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a2">MR</div>
                        <div>
                          <div className="name">Maxime Roy</div>
                          <div className="email">m.roy@atelierverre.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">8 jan 2026</td>
                    <td className="usr-orders">14</td>
                    <td className="usr-ltv high">4 218 $</td>
                    <td className="usr-date">16 mai · 13:48</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Québec <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a3">MD</div>
                        <div>
                          <div className="name">Marguerite Dubois</div>
                          <div className="email">marguerite@dubois-design.qc</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">22 mar 2026</td>
                    <td className="usr-orders">3</td>
                    <td className="usr-ltv">512 $</td>
                    <td className="usr-date">16 mai · 12:14</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Sherbrooke <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar guest">G</div>
                        <div>
                          <div className="name guest">Pierre Lavoie · guest</div>
                          <div className="email">pierre.lavoie@gmail.com</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">16 mai 2026</td>
                    <td className="usr-orders">1</td>
                    <td className="usr-ltv">142 $</td>
                    <td className="usr-date">16 mai · 11:02</td>
                    <td><span className="usr-status guest">Guest</span></td>
                    <td className="usr-province">Laval <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a4">CT</div>
                        <div>
                          <div className="name">Camille Tremblay</div>
                          <div className="email">camille@studiotrm.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">3 déc 2025</td>
                    <td className="usr-orders">22</td>
                    <td className="usr-ltv high">8 412 $</td>
                    <td className="usr-date">16 mai · 09:48</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Montréal <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a1">ÉG</div>
                        <div>
                          <div className="name">Étienne Gagnon</div>
                          <div className="email">e.gagnon@brasserie-nord.com</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">18 oct 2025</td>
                    <td className="usr-orders">9</td>
                    <td className="usr-ltv high">2 138 $</td>
                    <td className="usr-date">15 mai · 22:18</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Trois-Rivières <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a2">LB</div>
                        <div>
                          <div className="name">Léa Bouchard</div>
                          <div className="email">lea.bouchard@cohorteagency.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">12 nov 2025</td>
                    <td className="usr-orders">11</td>
                    <td className="usr-ltv high">3 042 $</td>
                    <td className="usr-date">15 mai · 18:55</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Montréal <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a3">AP</div>
                        <div>
                          <div className="name">Antoine Pelletier</div>
                          <div className="email">antoine@pelletier-design.qc</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">5 sep 2025</td>
                    <td className="usr-orders">6</td>
                    <td className="usr-ltv">1 248 $</td>
                    <td className="usr-date">15 mai · 16:42</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Gatineau <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar guest">G</div>
                        <div>
                          <div className="name guest">Geneviève Côté · guest</div>
                          <div className="email">g.cote@cliniqueverdure.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">15 mai 2026</td>
                    <td className="usr-orders">1</td>
                    <td className="usr-ltv">98 $</td>
                    <td className="usr-date">15 mai · 14:28</td>
                    <td><span className="usr-status guest">Guest</span></td>
                    <td className="usr-province">Drummondville <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a4">FB</div>
                        <div>
                          <div className="name">Frédéric Bélanger</div>
                          <div className="email">fred@belanger.studio</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">28 août 2025</td>
                    <td className="usr-orders">4</td>
                    <td className="usr-ltv">684 $</td>
                    <td className="usr-date">15 mai · 11:08</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Saguenay <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a5">IM</div>
                        <div>
                          <div className="name">Isabelle Mercier</div>
                          <div className="email">isa@mercier-papeterie.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">14 juin 2025</td>
                    <td className="usr-orders">18</td>
                    <td className="usr-ltv high">5 642 $</td>
                    <td className="usr-date">14 mai · 21:42</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Québec <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a1">OT</div>
                        <div>
                          <div className="name">Olivier Therrien</div>
                          <div className="email">o.therrien@nordique.coop</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">2 fév 2026</td>
                    <td className="usr-orders">2</td>
                    <td className="usr-ltv">312 $</td>
                    <td className="usr-date">14 mai · 18:30</td>
                    <td><span className="usr-status bounced">Bounced</span></td>
                    <td className="usr-province">Rimouski <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a2">MR</div>
                        <div>
                          <div className="name">Mathilde Renaud</div>
                          <div className="email">mathilde@renaud-studio.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">19 juil 2025</td>
                    <td className="usr-orders">8</td>
                    <td className="usr-ltv high">2 412 $</td>
                    <td className="usr-date">14 mai · 15:08</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Montréal <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a3">VC</div>
                        <div>
                          <div className="name">Vincent Charron</div>
                          <div className="email">v.charron@charronlaw.qc.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">11 avr 2026</td>
                    <td className="usr-orders">2</td>
                    <td className="usr-ltv">408 $</td>
                    <td className="usr-date">14 mai · 12:42</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Longueuil <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar guest">G</div>
                        <div>
                          <div className="name guest">Julie Lemieux · guest</div>
                          <div className="email">julie.lemieux@hotmail.com</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">13 mai 2026</td>
                    <td className="usr-orders">1</td>
                    <td className="usr-ltv">312 $</td>
                    <td className="usr-date">13 mai · 22:55</td>
                    <td><span className="usr-status pending">En attente</span></td>
                    <td className="usr-province">Saint-Jean <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a4">NS</div>
                        <div>
                          <div className="name">Nathalie Sirois</div>
                          <div className="email">n.sirois@boutiqueoursonne.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">9 mai 2025</td>
                    <td className="usr-orders">12</td>
                    <td className="usr-ltv high">3 814 $</td>
                    <td className="usr-date">13 mai · 19:30</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Lévis <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a5">AV</div>
                        <div>
                          <div className="name">Atelier Verre</div>
                          <div className="email">commandes@atelier-verre.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">23 mar 2025</td>
                    <td className="usr-orders">28</td>
                    <td className="usr-ltv high">9 248 $</td>
                    <td className="usr-date">13 mai · 16:12</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Montréal <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar guest">G</div>
                        <div>
                          <div className="name guest">Raphaël Boulanger · guest</div>
                          <div className="email">raphael@boulangerie-stdenis.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">13 mai 2026</td>
                    <td className="usr-orders">1</td>
                    <td className="usr-ltv">228 $</td>
                    <td className="usr-date">13 mai · 14:02</td>
                    <td><span className="usr-status guest">Guest</span></td>
                    <td className="usr-province">Montréal <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td>
                      <div className="usr-cell-name">
                        <div className="usr-avatar a1">CR</div>
                        <div>
                          <div className="name">Charlotte Rivard</div>
                          <div className="email">charlotte@cabinet-rivard.qc.ca</div>
                        </div>
                      </div>
                    </td>
                    <td className="usr-date">17 nov 2025</td>
                    <td className="usr-orders">5</td>
                    <td className="usr-ltv">812 $</td>
                    <td className="usr-date">13 mai · 10:48</td>
                    <td><span className="usr-status verified">Verified</span></td>
                    <td className="usr-province">Saint-Hyacinthe <span className="code">QC</span></td>
                    <td className="actions-col"><button className="usr-actions-btn">⋯</button></td>
                  </tr>
                </tbody>
              </table>
      
              <div className="usr-pagination">
                <div className="usr-pagination-left">
                  <span>Affiché <strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>1–19</strong> sur <strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>218</strong></span>
                  <select className="usr-pagesize">
                    <option>25 / page</option>
                    <option>50 / page</option>
                    <option>100 / page</option>
                  </select>
                </div>
                <div className="usr-pagination-right">
                  <button className="usr-pagination-btn" disabled>‹</button>
                  <div className="usr-pagination-page">
                    <button className="usr-pagination-btn current">1</button>
                    <button className="usr-pagination-btn">2</button>
                    <button className="usr-pagination-btn">3</button>
                    <button className="usr-pagination-btn">…</button>
                    <button className="usr-pagination-btn">9</button>
                  </div>
                  <button className="usr-pagination-btn">›</button>
                </div>
              </div>
            </div>
      
          </main>
        </div>
    </>
  );
}
