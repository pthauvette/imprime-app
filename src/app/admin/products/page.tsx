/**
 * Auto-migrated from Open Design HTML artifact `admin-products.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Admin — Catalogue Sinalite" };

export default function AdminProducts() {
  return (
    <>
      <div className="adm-shell">
      
          {/* ─── ADMIN SIDEBAR (active = Produits Sinalite) ────────────── */}
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
              <li><a href="admin-templates.html" className="adm-nav-link">
                <span className="adm-nav-link-text">
                  <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 6h12M5 9h6M5 11h4" /></svg>
                  Templates
                </span>
                <span className="adm-nav-count">3</span>
              </a></li>
              <li><a href="admin-products.html" className="adm-nav-link active">
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
                <h1 className="adm-page-title">Catalogue Sinalite</h1>
                <p className="adm-page-subtitle">468 produits · 9 catégories · last sync il y a 12 min</p>
              </div>
              <div className="adm-topbar-actions">
                <span className="adm-pulse">API Sinalite OK · v2.4.1</span>
                <button className="btn btn-secondary btn-sm">Cache stats</button>
                <button className="btn btn-primary btn-sm">↻ Resync now</button>
              </div>
            </header>
      
            {/* Sync status banner */}
            <div className="adm-sync-banner">
              <div className="adm-sync-banner-left">
                <div className="adm-sync-ico">⊕</div>
                <div className="adm-sync-body">
                  <div><strong>Variants index</strong> · 12 408 combos cachés · TTL 8 min restant · 94 % hit rate</div>
                  <div className="meta">Dernière purge : <strong>2026-05-16 09:14</strong> · prochaine : <strong>2026-05-16 09:22</strong> · stratégie : LRU + invalidation par webhook</div>
                </div>
              </div>
              <div className="adm-sync-banner-right">
                <div className="adm-sync-stat">
                  <strong>12 408</strong>
                  combos cachés
                </div>
                <div className="adm-sync-stat">
                  <strong>94 %</strong>
                  hit rate 24h
                </div>
                <div className="adm-sync-stat">
                  <strong>38 ms</strong>
                  p50 lookup
                </div>
              </div>
            </div>
      
            {/* Filter row */}
            <div className="adm-filter-row">
              <div className="adm-pills">
                <button className="adm-pill active">Toutes <span className="adm-pill-count">468</span></button>
                <button className="adm-pill">Business Cards <span className="adm-pill-count">16</span></button>
                <button className="adm-pill">Flyers <span className="adm-pill-count">24</span></button>
                <button className="adm-pill">Postcards <span className="adm-pill-count">12</span></button>
                <button className="adm-pill">Brochures <span className="adm-pill-count">8</span></button>
                <button className="adm-pill">Banners <span className="adm-pill-count">6</span></button>
                <button className="adm-pill">Apparel <span className="adm-pill-count">4</span></button>
                <button className="adm-pill">Labels <span className="adm-pill-count">9</span></button>
                <button className="adm-pill">Stationery <span className="adm-pill-count">7</span></button>
                <button className="adm-pill">Misc <span className="adm-pill-count">382</span></button>
              </div>
              <div className="adm-search-compact">
                <svg className="adm-search-compact-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" /></svg>
                <input type="text" placeholder="Rechercher par SKU, nom, ID…" />
                <span className="adm-search-compact-kbd">⌘K</span>
              </div>
            </div>
      
            {/* Products table */}
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>SKU</th>
                    <th>Nom</th>
                    <th>Catégorie</th>
                    <th className="num">Variants</th>
                    <th className="num">Min price</th>
                    <th>Actif</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="expanded">
                    <td className="id">001</td>
                    <td className="sku">BC-14PT-PM-3.5×2</td>
                    <td className="name">
                      <div className="name-row">
                        <svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>
                        Business Cards 14pt Profit Maximizer
                      </div>
                    </td>
                    <td className="cat"><span className="badge badge-accent">Business Cards</span></td>
                    <td className="num">86</td>
                    <td className="num price"><strong>0,02</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  {/* Drawer for row 1 */}
                  <tr className="adm-drawer-row">
                    <td colSpan={7}>
                      <div className="adm-drawer">
                        <div>
                          <div className="adm-drawer-section-label">Variants matrix <span className="count">12 / 86 affichées</span></div>
                          <table className="variants-mini">
                            <thead>
                              <tr>
                                <th>Qty</th>
                                <th>Stock</th>
                                <th>Coating</th>
                                <th className="num">Unit $</th>
                                <th className="num">Total $</th>
                                <th>Cache</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr><td className="qty">100</td><td>14pt C2S</td><td>UV gloss 2 côtés</td><td className="num">0,84</td><td className="num">83,84</td><td><span className="cache-dot"></span>HIT · 38 ms</td></tr>
                              <tr><td className="qty">100</td><td>14pt C2S</td><td>Matte 2 côtés</td><td className="num">0,79</td><td className="num">79,40</td><td><span className="cache-dot"></span>HIT · 22 ms</td></tr>
                              <tr><td className="qty">250</td><td>14pt C2S</td><td>UV gloss 2 côtés</td><td className="num">0,42</td><td className="num">104,50</td><td><span className="cache-dot"></span>HIT · 41 ms</td></tr>
                              <tr><td className="qty">250</td><td>14pt C2S</td><td>Matte 2 côtés</td><td className="num">0,39</td><td className="num">98,12</td><td><span className="cache-dot"></span>HIT · 35 ms</td></tr>
                              <tr><td className="qty">500</td><td>14pt C2S</td><td>UV gloss 2 côtés</td><td className="num">0,18</td><td className="num">89,40</td><td><span className="cache-dot"></span>HIT · 28 ms</td></tr>
                              <tr><td className="qty">500</td><td>14pt C2S</td><td>Matte 2 côtés</td><td className="num">0,15</td><td className="num">76,18</td><td><span className="cache-dot"></span>HIT · 31 ms</td></tr>
                              <tr><td className="qty">1 000</td><td>14pt C2S</td><td>UV gloss 2 côtés</td><td className="num">0,08</td><td className="num">82,40</td><td><span className="cache-dot miss"></span>MISS · 412 ms</td></tr>
                              <tr><td className="qty">2 500</td><td>14pt C2S</td><td>Matte 2 côtés</td><td className="num">0,04</td><td className="num">99,80</td><td><span className="cache-dot"></span>HIT · 24 ms</td></tr>
                              <tr><td className="qty">5 000</td><td>14pt C2S</td><td>Soft touch</td><td className="num">0,03</td><td className="num">142,20</td><td><span className="cache-dot"></span>HIT · 39 ms</td></tr>
                              <tr><td className="qty">10 000</td><td>14pt C2S</td><td>UV spot</td><td className="num">0,02</td><td className="num">189,00</td><td><span className="cache-dot miss"></span>MISS · 488 ms</td></tr>
                            </tbody>
                          </table>
                        </div>
                        <div>
                          <div className="adm-drawer-section-label">Métadonnées</div>
                          <div className="drawer-meta-grid">
                            <div className="drawer-meta-row"><span className="label">Sinalite ID</span><span className="value">PRD-14001</span></div>
                            <div className="drawer-meta-row"><span className="label">Trim size</span><span className="value">3.5 × 2 in</span></div>
                            <div className="drawer-meta-row"><span className="label">Bleed</span><span className="value">0.125 in</span></div>
                            <div className="drawer-meta-row"><span className="label">Turnaround</span><span className="value">3–5 jours ouvr.</span></div>
                            <div className="drawer-meta-row"><span className="label">Stock options</span><span className="value">14pt C2S, 14pt linen</span></div>
                            <div className="drawer-meta-row"><span className="label">Coatings</span><span className="value">UV, matte, soft touch, spot</span></div>
                            <div className="drawer-meta-row"><span className="label">Mapping template</span><span className="value">bc-minimal-bw +2</span></div>
                            <div className="drawer-meta-row"><span className="label">Orders 30j</span><span className="value">62 · 4 218 $ rev</span></div>
                          </div>
                          <div className="drawer-actions">
                            <a href="#" className="drawer-action">↻ Re-fetch live</a>
                            <a href="#" className="drawer-action">Purger cache</a>
                            <a href="#" className="drawer-action">Voir sur Sinalite ↗</a>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
      
                  <tr>
                    <td className="id">002</td>
                    <td className="sku">BC-16PT-UV-3.5×2</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Business Cards 16pt UV gloss</div></td>
                    <td className="cat"><span className="badge badge-accent">Business Cards</span></td>
                    <td className="num">72</td>
                    <td className="num price"><strong>0,03</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">003</td>
                    <td className="sku">BC-16PT-MAT-3.5×2</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Business Cards 16pt Silk Matte</div></td>
                    <td className="cat"><span className="badge badge-accent">Business Cards</span></td>
                    <td className="num">68</td>
                    <td className="num price"><strong>0,03</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">004</td>
                    <td className="sku">BC-32PT-PR-3.5×2</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Business Cards 32pt Painted Edge</div></td>
                    <td className="cat"><span className="badge badge-accent">Business Cards</span></td>
                    <td className="num">48</td>
                    <td className="num price"><strong>0,18</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">005</td>
                    <td className="sku">BC-LIN-14PT-3.5×2</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Business Cards 14pt Linen Uncoated</div></td>
                    <td className="cat"><span className="badge badge-accent">Business Cards</span></td>
                    <td className="num">42</td>
                    <td className="num price"><strong>0,06</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">006</td>
                    <td className="sku">BC-AKURA-13PT-3.5×2</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Business Cards 13pt Akuafoil</div></td>
                    <td className="cat"><span className="badge badge-accent">Business Cards</span></td>
                    <td className="num">36</td>
                    <td className="num price"><strong>0,24</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle off"></span></td>
                  </tr>
                  <tr>
                    <td className="id">007</td>
                    <td className="sku">FL-8.5×11-100LB-MAT</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Flyers 8.5 × 11 · 100lb Gloss Matte</div></td>
                    <td className="cat"><span className="badge badge-warning">Flyers</span></td>
                    <td className="num">94</td>
                    <td className="num price"><strong>0,12</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">008</td>
                    <td className="sku">FL-8.5×11-100LB-GLS</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Flyers 8.5 × 11 · 100lb Gloss UV</div></td>
                    <td className="cat"><span className="badge badge-warning">Flyers</span></td>
                    <td className="num">88</td>
                    <td className="num price"><strong>0,14</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">009</td>
                    <td className="sku">FL-5.5×8.5-100LB</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Flyers 5.5 × 8.5 · 100lb Text Stock</div></td>
                    <td className="cat"><span className="badge badge-warning">Flyers</span></td>
                    <td className="num">72</td>
                    <td className="num price"><strong>0,08</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">010</td>
                    <td className="sku">FL-4×6-14PT</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Flyers 4 × 6 · 14pt Cardstock</div></td>
                    <td className="cat"><span className="badge badge-warning">Flyers</span></td>
                    <td className="num">56</td>
                    <td className="num price"><strong>0,09</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">011</td>
                    <td className="sku">PC-5×7-14PT-UV</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Postcards 5 × 7 · 14pt UV Coated</div></td>
                    <td className="cat"><span className="badge badge-info">Postcards</span></td>
                    <td className="num">48</td>
                    <td className="num price"><strong>0,17</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">012</td>
                    <td className="sku">PC-4×6-16PT-MAT</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Postcards 4 × 6 · 16pt Silk Matte</div></td>
                    <td className="cat"><span className="badge badge-info">Postcards</span></td>
                    <td className="num">42</td>
                    <td className="num price"><strong>0,14</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">013</td>
                    <td className="sku">PC-6×9-14PT-MAT</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Postcards 6 × 9 · 14pt Coated 1S</div></td>
                    <td className="cat"><span className="badge badge-info">Postcards</span></td>
                    <td className="num">38</td>
                    <td className="num price"><strong>0,21</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle off"></span></td>
                  </tr>
                  <tr>
                    <td className="id">014</td>
                    <td className="sku">BR-8.5×11-TRI-100LB</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Brochures 8.5 × 11 · Tri-Fold 100lb</div></td>
                    <td className="cat"><span className="badge badge-success">Brochures</span></td>
                    <td className="num">62</td>
                    <td className="num price"><strong>0,32</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">015</td>
                    <td className="sku">BR-11×17-HALF-100LB</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Brochures 11 × 17 · Half-Fold 100lb</div></td>
                    <td className="cat"><span className="badge badge-success">Brochures</span></td>
                    <td className="num">54</td>
                    <td className="num price"><strong>0,48</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">016</td>
                    <td className="sku">BR-8.5×14-Z-100LB</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Brochures 8.5 × 14 · Z-Fold 100lb</div></td>
                    <td className="cat"><span className="badge badge-success">Brochures</span></td>
                    <td className="num">42</td>
                    <td className="num price"><strong>0,38</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">017</td>
                    <td className="sku">BN-24×36-13OZ-VIN</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Banners 24 × 36 · 13oz Vinyl</div></td>
                    <td className="cat"><span className="badge badge-neutral">Banners</span></td>
                    <td className="num">28</td>
                    <td className="num price"><strong>18,20</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">018</td>
                    <td className="sku">BN-48×96-13OZ-VIN</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Banners 48 × 96 · 13oz Vinyl Hem & Grommets</div></td>
                    <td className="cat"><span className="badge badge-neutral">Banners</span></td>
                    <td className="num">22</td>
                    <td className="num price"><strong>62,40</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">019</td>
                    <td className="sku">AP-TEE-COT-DTG</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Apparel T-Shirt 100% Cotton DTG</div></td>
                    <td className="cat"><span className="badge badge-neutral">Apparel</span></td>
                    <td className="num">96</td>
                    <td className="num price"><strong>14,80</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle off"></span></td>
                  </tr>
                  <tr>
                    <td className="id">020</td>
                    <td className="sku">LB-CIR-2-BOPP-GLS</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Labels Circle 2" · BOPP Gloss</div></td>
                    <td className="cat"><span className="badge badge-danger">Labels</span></td>
                    <td className="num">48</td>
                    <td className="num price"><strong>0,14</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">021</td>
                    <td className="sku">LB-RECT-3×4-PAP-MAT</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Labels Rectangle 3 × 4 · Paper Matte</div></td>
                    <td className="cat"><span className="badge badge-danger">Labels</span></td>
                    <td className="num">36</td>
                    <td className="num price"><strong>0,12</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">022</td>
                    <td className="sku">ST-LH-70LB-4×4</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Stationery Letterhead 70lb Uncoated</div></td>
                    <td className="cat"><span className="badge badge-neutral">Stationery</span></td>
                    <td className="num">28</td>
                    <td className="num price"><strong>0,18</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">023</td>
                    <td className="sku">ST-ENV-#10-WHT-LIN</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Stationery Envelopes #10 Linen Uncoated</div></td>
                    <td className="cat"><span className="badge badge-neutral">Stationery</span></td>
                    <td className="num">24</td>
                    <td className="num price"><strong>0,22</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                  <tr>
                    <td className="id">024</td>
                    <td className="sku">ST-NCR-4PT-CARB</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Stationery NCR Forms 4-Part Carbonless</div></td>
                    <td className="cat"><span className="badge badge-neutral">Stationery</span></td>
                    <td className="num">18</td>
                    <td className="num price"><strong>0,42</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle off"></span></td>
                  </tr>
                  <tr>
                    <td className="id">025</td>
                    <td className="sku">MS-RACK-4×9-100LB</td>
                    <td className="name"><div className="name-row"><svg className="expand-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4" /></svg>Rack Cards 4 × 9 · 100lb Cover Gloss</div></td>
                    <td className="cat"><span className="badge badge-neutral">Misc</span></td>
                    <td className="num">38</td>
                    <td className="num price"><strong>0,16</strong><span className="unit">$ /u</span></td>
                    <td><span className="adm-toggle"></span></td>
                  </tr>
                </tbody>
              </table>
      
              <div className="adm-table-foot">
                <span>Affichage 1–25 sur 468 produits · 22 produits actifs sur 25</span>
                <div className="adm-pager">
                  <button className="adm-pager-btn">←</button>
                  <button className="adm-pager-btn active">1</button>
                  <button className="adm-pager-btn">2</button>
                  <button className="adm-pager-btn">3</button>
                  <button className="adm-pager-btn">…</button>
                  <button className="adm-pager-btn">19</button>
                  <button className="adm-pager-btn">→</button>
                </div>
              </div>
            </div>
      
            {/* Cache health */}
            <div className="adm-cache-panel">
              <div className="adm-cache-head">
                <h2 className="adm-cache-title">
                  Variants index — cache health
                  <span className="adm-cache-title-meta">24 dernières heures · bucket 1h</span>
                </h2>
                <div className="adm-cache-legend">
                  <span><span className="swatch" style={{ background: "var(--accent-primary)" } as React.CSSProperties}></span>HIT</span>
                  <span><span className="swatch" style={{ background: "var(--warning)" } as React.CSSProperties}></span>MISS</span>
                </div>
              </div>
              <div className="adm-cache-chart">
                <div className="adm-cache-bars">
                  {/* 24 hourly bars; heights tuned for variety; last col is "now" */}
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "18%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "4%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "14%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "3%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "12%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "3%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "10%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "2%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "11%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "2%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "16%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "4%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "28%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "8%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "42%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "12%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "58%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "14%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "64%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "12%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "72%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "10%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "80%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "8%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "88%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "6%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "76%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "5%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "68%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "4%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "74%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "6%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "84%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "7%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "90%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "9%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "82%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "6%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "70%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "5%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "56%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "4%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "48%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "3%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col"><div className="adm-cache-bar-hit" style={{ height: "38%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "3%" } as React.CSSProperties}></div></div>
                  <div className="adm-cache-bar-col now"><div className="adm-cache-bar-hit" style={{ height: "32%" } as React.CSSProperties}></div><div className="adm-cache-bar-miss" style={{ height: "2%" } as React.CSSProperties}></div></div>
                </div>
                <div className="adm-cache-axis">
                  <span>−24 h</span><span>−20 h</span><span>−16 h</span><span>−12 h</span><span>−8 h</span><span>−4 h</span><span>−1 h</span><span>now</span>
                </div>
              </div>
              <div className="adm-cache-summary">
                <div className="adm-cache-summary-cell">
                  <div className="adm-cache-summary-label">Hit rate — 24h</div>
                  <div className="adm-cache-summary-value">94<span className="unit">%</span></div>
                  <div className="adm-cache-summary-detail up">↑ 2 pts vs 7j</div>
                </div>
                <div className="adm-cache-summary-cell">
                  <div className="adm-cache-summary-label">Lookups — 24h</div>
                  <div className="adm-cache-summary-value">28 412<span className="unit">req</span></div>
                  <div className="adm-cache-summary-detail">26 707 hit · 1 705 miss</div>
                </div>
                <div className="adm-cache-summary-cell">
                  <div className="adm-cache-summary-label">P50 / P99 latency</div>
                  <div className="adm-cache-summary-value">38 / 412<span className="unit">ms</span></div>
                  <div className="adm-cache-summary-detail">SLO &lt; 500 ms ✓</div>
                </div>
                <div className="adm-cache-summary-cell">
                  <div className="adm-cache-summary-label">Cache size</div>
                  <div className="adm-cache-summary-value">12 408<span className="unit">combos</span></div>
                  <div className="adm-cache-summary-detail">~ 18,4 MB · ceiling 64 MB</div>
                </div>
              </div>
            </div>
      
          </main>
        </div>
    </>
  );
}
