/**
 * Auto-migrated from Open Design HTML artifact `admin-orders.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Admin — Commandes" };

export default function AdminOrders() {
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
              <li><a href="admin-orders.html" className="adm-nav-link active">
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
                <h1 className="adm-page-title">Toutes les commandes</h1>
                <p className="adm-page-subtitle">142 commandes · 38 actives · synced il y a 12 s</p>
              </div>
              <div className="adm-topbar-actions">
                <button className="btn btn-secondary btn-sm">↓ Exporter CSV</button>
                <button className="btn btn-primary btn-sm">+ Manual order</button>
              </div>
            </header>
      
            {/* ─── Mini stats ──────────────────────────────────────────── */}
            <section className="ord-stats">
              <div className="ord-stat">
                <div className="ord-stat-label">Aujourd'hui</div>
                <div className="ord-stat-value">2 847<span className="unit">$ CAD</span></div>
                <div className="ord-stat-meta up">↑ 12 commandes · +18 %</div>
              </div>
              <div className="ord-stat">
                <div className="ord-stat-label">Cette semaine</div>
                <div className="ord-stat-value">18 412<span className="unit">$ CAD</span></div>
                <div className="ord-stat-meta up">↑ 64 commandes · +9 %</div>
              </div>
              <div className="ord-stat">
                <div className="ord-stat-label">Ce mois-ci</div>
                <div className="ord-stat-value">68 412<span className="unit">$ CAD</span></div>
                <div className="ord-stat-meta">142 commandes · panier moy. 482 $</div>
              </div>
              <div className="ord-stat">
                <div className="ord-stat-label">En attente d'action</div>
                <div className="ord-stat-value">7<span className="unit">à traiter</span></div>
                <div className="ord-stat-meta warn">3 webhooks · 1 refund · 3 prepress</div>
              </div>
            </section>
      
            {/* ─── Filter bar ──────────────────────────────────────────── */}
            <div className="ord-filterbar">
              <div className="ord-pills">
                <button className="ord-pill active">Tous <span className="ord-pill-count">142</span></button>
                <button className="ord-pill">Payée <span className="ord-pill-count">14</span></button>
                <button className="ord-pill">Soumise <span className="ord-pill-count">9</span></button>
                <button className="ord-pill">Production <span className="ord-pill-count">38</span></button>
                <button className="ord-pill">Expédiée <span className="ord-pill-count">52</span></button>
                <button className="ord-pill">Livrée <span className="ord-pill-count">26</span></button>
                <button className="ord-pill">Échec <span className="ord-pill-count">3</span></button>
              </div>
              <div className="ord-search">
                <svg className="ord-search-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" /></svg>
                <input type="text" placeholder="Cherche #SIN-..., email, nom client..." />
                <span className="ord-search-kbd">⌘K</span>
              </div>
              <button className="ord-date">
                <svg className="ord-date-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="1" /><path d="M2 6h12M5 1v3M11 1v3" /></svg>
                1 mai – 16 mai 2026
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 1l4 4 4-4" /></svg>
              </button>
            </div>
      
            {/* ─── Table ───────────────────────────────────────────────── */}
            <div className="ord-panel">
              <table className="ord-table">
                <thead>
                  <tr>
                    <th className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></th>
                    <th className="sortable sorted">Date <svg className="sort-ico" viewBox="0 0 8 10" fill="currentColor"><path d="M4 0L0 4h8z M4 10L0 6h8z" opacity="0.4" /><path d="M4 10L0 6h8z" /></svg></th>
                    <th>Order ID</th>
                    <th>Client</th>
                    <th>Produit</th>
                    <th className="sortable" style={{ textAlign: "right" } as React.CSSProperties}>Qty</th>
                    <th className="sortable" style={{ textAlign: "right" } as React.CSSProperties}>Total <svg className="sort-ico" viewBox="0 0 8 10" fill="currentColor"><path d="M4 0L0 4h8z M4 10L0 6h8z" /></svg></th>
                    <th>Status</th>
                    <th>Sinalite ID</th>
                    <th className="actions-col"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="selected">
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" checked /></td>
                    <td className="ord-date-cell">16 mai · 14:32</td>
                    <td><span className="ord-id">#SIN-48312</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Sophie Beauchamp</span><span className="ord-customer-email">sophie@boreal.studio</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes d'affaires 16pt</span><span className="ord-product-spec">UV gloss · 3,5×2 · R/V</span></div></td>
                    <td className="ord-qty">250</td>
                    <td className="ord-total">187,42 $</td>
                    <td><span className="ord-status paid">Payée</span></td>
                    <td><span className="ord-sinid empty">—</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr className="selected">
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" checked /></td>
                    <td className="ord-date-cell">16 mai · 13:48</td>
                    <td><span className="ord-id">#SIN-48311</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Maxime Roy</span><span className="ord-customer-email">m.roy@atelierverre.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Flyers 100lb gloss</span><span className="ord-product-spec">8,5×11 · R/V · coupe</span></div></td>
                    <td className="ord-qty">500</td>
                    <td className="ord-total">342,18 $</td>
                    <td><span className="ord-status submitted">Soumise</span></td>
                    <td><span className="ord-sinid">SL-8842219</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr className="selected">
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" checked /></td>
                    <td className="ord-date-cell">16 mai · 12:14</td>
                    <td><span className="ord-id">#SIN-48310</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Marguerite Dubois</span><span className="ord-customer-email">marguerite@dubois-design.qc</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes d'affaires 14pt</span><span className="ord-product-spec">Matte · 3,5×2 · R/V</span></div></td>
                    <td className="ord-qty">100</td>
                    <td className="ord-total">78,12 $</td>
                    <td><span className="ord-status production">Production</span></td>
                    <td><span className="ord-sinid">SL-8842218</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">16 mai · 11:02</td>
                    <td><span className="ord-id">#SIN-48309</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Pierre Lavoie</span><span className="ord-customer-email">pierre.lavoie@gmail.com</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes postales 14pt</span><span className="ord-product-spec">UV gloss · 5×7 · R/V</span></div></td>
                    <td className="ord-qty">250</td>
                    <td className="ord-total">142,80 $</td>
                    <td><span className="ord-status production">Production</span></td>
                    <td><span className="ord-sinid">SL-8842217</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">16 mai · 09:48</td>
                    <td><span className="ord-id">#SIN-48308</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Camille Tremblay</span><span className="ord-customer-email">camille@studiotrm.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Brochures pliées 100lb</span><span className="ord-product-spec">11×17 → tri-fold · R/V</span></div></td>
                    <td className="ord-qty">1 000</td>
                    <td className="ord-total">684,50 $</td>
                    <td><span className="ord-status shipped">Expédiée</span></td>
                    <td><span className="ord-sinid">SL-8842211</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">15 mai · 22:18</td>
                    <td><span className="ord-id">#SIN-48307</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Étienne Gagnon</span><span className="ord-customer-email">e.gagnon@brasserie-nord.com</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Étiquettes vinyle</span><span className="ord-product-spec">Découpe forme · 3×4</span></div></td>
                    <td className="ord-qty">500</td>
                    <td className="ord-total">218,94 $</td>
                    <td><span className="ord-status production">Production</span></td>
                    <td><span className="ord-sinid">SL-8842209</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">15 mai · 18:55</td>
                    <td><span className="ord-id">#SIN-48306</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Léa Bouchard</span><span className="ord-customer-email">lea.bouchard@cohorteagency.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes d'affaires 16pt</span><span className="ord-product-spec">Soft touch · 3,5×2 · R/V</span></div></td>
                    <td className="ord-qty">500</td>
                    <td className="ord-total">264,12 $</td>
                    <td><span className="ord-status shipped">Expédiée</span></td>
                    <td><span className="ord-sinid">SL-8842205</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">15 mai · 16:42</td>
                    <td><span className="ord-id">#SIN-48305</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Antoine Pelletier</span><span className="ord-customer-email">antoine@pelletier-design.qc</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Affiches 100lb satin</span><span className="ord-product-spec">18×24 · simple face</span></div></td>
                    <td className="ord-qty">25</td>
                    <td className="ord-total">412,68 $</td>
                    <td><span className="ord-status delivered">Livrée</span></td>
                    <td><span className="ord-sinid">SL-8842198</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">15 mai · 14:28</td>
                    <td><span className="ord-id">#SIN-48304</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Geneviève Côté</span><span className="ord-customer-email">g.cote@cliniqueverdure.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes rendez-vous 14pt</span><span className="ord-product-spec">Matte · 3,5×2 · R/V</span></div></td>
                    <td className="ord-qty">250</td>
                    <td className="ord-total">98,40 $</td>
                    <td><span className="ord-status shipped">Expédiée</span></td>
                    <td><span className="ord-sinid">SL-8842192</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">15 mai · 11:08</td>
                    <td><span className="ord-id">#SIN-48303</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Frédéric Bélanger</span><span className="ord-customer-email">fred@belanger.studio</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes postales 14pt</span><span className="ord-product-spec">Linen · 4×6 · R/V</span></div></td>
                    <td className="ord-qty">100</td>
                    <td className="ord-total">62,15 $</td>
                    <td><span className="ord-status delivered">Livrée</span></td>
                    <td><span className="ord-sinid">SL-8842187</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">14 mai · 21:42</td>
                    <td><span className="ord-id">#SIN-48302</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Isabelle Mercier</span><span className="ord-customer-email">isa@mercier-papeterie.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Pochettes papier kraft</span><span className="ord-product-spec">Brun · 9×12 · poignée corde</span></div></td>
                    <td className="ord-qty">300</td>
                    <td className="ord-total">528,90 $</td>
                    <td><span className="ord-status production">Production</span></td>
                    <td><span className="ord-sinid">SL-8842180</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">14 mai · 18:30</td>
                    <td><span className="ord-id">#SIN-48301</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Olivier Therrien</span><span className="ord-customer-email">o.therrien@nordique.coop</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes d'affaires 32pt</span><span className="ord-product-spec">Painted edge · 3,5×2</span></div></td>
                    <td className="ord-qty">100</td>
                    <td className="ord-total">189,75 $</td>
                    <td><span className="ord-status failed">Échec</span></td>
                    <td><span className="ord-sinid">SL-8842175</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">14 mai · 15:08</td>
                    <td><span className="ord-id">#SIN-48300</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Mathilde Renaud</span><span className="ord-customer-email">mathilde@renaud-studio.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Flyers 100lb satin</span><span className="ord-product-spec">5,5×8,5 · R/V</span></div></td>
                    <td className="ord-qty">2 500</td>
                    <td className="ord-total">912,40 $</td>
                    <td><span className="ord-status shipped">Expédiée</span></td>
                    <td><span className="ord-sinid">SL-8842170</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">14 mai · 12:42</td>
                    <td><span className="ord-id">#SIN-48299</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Vincent Charron</span><span className="ord-customer-email">v.charron@charronlaw.qc.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes d'affaires 16pt</span><span className="ord-product-spec">UV high gloss · 3,5×2 · R/V</span></div></td>
                    <td className="ord-qty">500</td>
                    <td className="ord-total">218,00 $</td>
                    <td><span className="ord-status delivered">Livrée</span></td>
                    <td><span className="ord-sinid">SL-8842168</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">14 mai · 10:18</td>
                    <td><span className="ord-id">#SIN-48298</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Sophie Beauchamp</span><span className="ord-customer-email">sophie@boreal.studio</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes d'affaires 16pt</span><span className="ord-product-spec">UV high gloss · 3,5×2 · R/V</span></div></td>
                    <td className="ord-qty">250</td>
                    <td className="ord-total">187,42 $</td>
                    <td><span className="ord-status shipped">Expédiée</span></td>
                    <td><span className="ord-sinid">SL-8842165</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">13 mai · 22:55</td>
                    <td><span className="ord-id">#SIN-48297</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Julie Lemieux</span><span className="ord-customer-email">julie.lemieux@hotmail.com</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Carnets agrafés</span><span className="ord-product-spec">5,5×8,5 · 24 pages · couv. 100lb</span></div></td>
                    <td className="ord-qty">50</td>
                    <td className="ord-total">312,80 $</td>
                    <td><span className="ord-status production">Production</span></td>
                    <td><span className="ord-sinid">SL-8842158</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">13 mai · 19:30</td>
                    <td><span className="ord-id">#SIN-48296</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Nathalie Sirois</span><span className="ord-customer-email">n.sirois@boutiqueoursonne.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Étiquettes adhésives</span><span className="ord-product-spec">Vinyle blanc · 2×2 · rond</span></div></td>
                    <td className="ord-qty">1 000</td>
                    <td className="ord-total">142,50 $</td>
                    <td><span className="ord-status shipped">Expédiée</span></td>
                    <td><span className="ord-sinid">SL-8842152</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">13 mai · 16:12</td>
                    <td><span className="ord-id">#SIN-48295</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Atelier Verre</span><span className="ord-customer-email">commandes@atelier-verre.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes postales 16pt</span><span className="ord-product-spec">UV gloss · 5×7 · R/V</span></div></td>
                    <td className="ord-qty">2 000</td>
                    <td className="ord-total">684,20 $</td>
                    <td><span className="ord-status failed">Échec</span></td>
                    <td><span className="ord-sinid">SL-8842148</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">13 mai · 14:02</td>
                    <td><span className="ord-id">#SIN-48294</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Raphaël Boulanger</span><span className="ord-customer-email">raphael@boulangerie-stdenis.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Menus laminés 14pt</span><span className="ord-product-spec">Lamination 5mil · 4×9 · R/V</span></div></td>
                    <td className="ord-qty">75</td>
                    <td className="ord-total">228,15 $</td>
                    <td><span className="ord-status delivered">Livrée</span></td>
                    <td><span className="ord-sinid">SL-8842142</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                  <tr>
                    <td className="checkbox-col"><input type="checkbox" className="ord-checkbox" /></td>
                    <td className="ord-date-cell">13 mai · 10:48</td>
                    <td><span className="ord-id">#SIN-48293</span></td>
                    <td><div className="ord-customer"><span className="ord-customer-name">Charlotte Rivard</span><span className="ord-customer-email">charlotte@cabinet-rivard.qc.ca</span></div></td>
                    <td><div className="ord-product"><span className="ord-product-name">Cartes d'affaires 14pt</span><span className="ord-product-spec">Matte · 3,5×2 · simple face</span></div></td>
                    <td className="ord-qty">100</td>
                    <td className="ord-total">54,20 $</td>
                    <td><span className="ord-status delivered">Livrée</span></td>
                    <td><span className="ord-sinid">SL-8842138</span></td>
                    <td className="actions-col"><button className="ord-actions-btn">⋯</button></td>
                  </tr>
                </tbody>
              </table>
      
              {/* Pagination */}
              <div className="ord-pagination">
                <div className="ord-pagination-left">
                  <span>Affiché <strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>1–20</strong> sur <strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>142</strong></span>
                  <select className="ord-pagesize">
                    <option>20 / page</option>
                    <option>50 / page</option>
                    <option>100 / page</option>
                  </select>
                </div>
                <div className="ord-pagination-right">
                  <button className="ord-pagination-btn" disabled>‹</button>
                  <div className="ord-pagination-page">
                    <button className="ord-pagination-btn current">1</button>
                    <button className="ord-pagination-btn">2</button>
                    <button className="ord-pagination-btn">3</button>
                    <button className="ord-pagination-btn">4</button>
                    <button className="ord-pagination-btn">…</button>
                    <button className="ord-pagination-btn">8</button>
                  </div>
                  <button className="ord-pagination-btn">›</button>
                </div>
              </div>
            </div>
      
            {/* ─── Bulk action bar (visible when rows selected) ────────── */}
            <div className="ord-bulkbar">
              <span className="ord-bulkbar-count">3 sélectionnées</span>
              <button className="ord-bulkbar-btn primary">↗ Mark shipped</button>
              <button className="ord-bulkbar-btn">↩ Refund</button>
              <button className="ord-bulkbar-btn">↓ Export</button>
              <button className="ord-bulkbar-btn danger">✕ Delete</button>
              <button className="ord-bulkbar-close" aria-label="Fermer">✕</button>
            </div>
      
          </main>
        </div>
    </>
  );
}
