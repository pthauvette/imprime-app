/**
 * Auto-migrated from Open Design HTML artifact `admin-finances.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Admin — Finances" };

export default function AdminFinances() {
  return (
    <>
      <div className="adm-shell">
      
          {/* ─── SIDEBAR (identical to dashboard, "Finances" active) ── */}
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
              <li><a href="admin-finances.html" className="adm-nav-link active">
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
      
          {/* ─── MAIN ──────────────────────────────────────────────── */}
          <main className="adm-main">
      
            <header className="adm-topbar">
              <div>
                <h1 className="adm-page-title">Finances</h1>
                <p className="adm-page-subtitle">Période : 1 mai – 16 mai 2026 · MTD · devise CAD</p>
              </div>
              <div className="adm-topbar-actions">
                <div className="adm-period">
                  <button>Aujourd'hui</button>
                  <button>7 j</button>
                  <button>30 j</button>
                  <button className="active">MTD</button>
                  <button>YTD</button>
                  <button>Custom…</button>
                </div>
              </div>
            </header>
      
            {/* ─── Hero stats ──────────────────────────────────────── */}
            <section className="adm-hero-stats">
              <div className="adm-hero-card featured">
                <div className="adm-hero-label">Revenu brut MTD</div>
                <div className="adm-hero-value">38 472<span className="unit">$ CAD</span></div>
                <div className="adm-hero-trend up">↑ 24 % vs mois précédent</div>
                <div className="adm-hero-meta">142 commandes · panier moyen 271 $</div>
                <svg className="adm-hero-spark" viewBox="0 0 320 48" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="spark-gross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="var(--accent-primary)" stop-opacity="0.32" />
                      <stop offset="100%" stop-color="var(--accent-primary)" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,38 L20,36 L40,32 L60,34 L80,28 L100,30 L120,22 L140,26 L160,20 L180,16 L200,22 L220,14 L240,12 L260,18 L280,10 L300,8 L320,4 L320,48 L0,48 Z" fill="url(#spark-gross)" />
                  <polyline points="0,38 20,36 40,32 60,34 80,28 100,30 120,22 140,26 160,20 180,16 200,22 220,14 240,12 260,18 280,10 300,8 320,4" fill="none" stroke="var(--accent-primary)" stroke-width="1.5" />
                </svg>
              </div>
      
              <div className="adm-hero-card">
                <div className="adm-hero-label">Refunds MTD</div>
                <div className="adm-hero-value danger">−487<span className="unit">$ CAD</span></div>
                <div className="adm-hero-trend neutral">1,3 % du brut · cible &lt; 2 % ✓</div>
                <div className="adm-hero-meta">5 refunds émis · 487,42 $ total</div>
                <svg className="adm-hero-spark" viewBox="0 0 320 48" preserveAspectRatio="none">
                  <polyline points="0,20 20,24 40,28 60,22 80,26 100,30 120,28 140,32 160,26 180,30 200,28 220,34 240,32 260,30 280,36 300,32 320,34" fill="none" stroke="var(--danger)" stroke-width="1.5" />
                  <g fill="var(--danger)" opacity="0.7">
                    <rect x="38" y="34" width="3" height="10" />
                    <rect x="98" y="30" width="3" height="14" />
                    <rect x="178" y="26" width="3" height="18" />
                    <rect x="238" y="32" width="3" height="12" />
                    <rect x="298" y="36" width="3" height="8" />
                  </g>
                </svg>
              </div>
      
              <div className="adm-hero-card">
                <div className="adm-hero-label">Revenu net MTD</div>
                <div className="adm-hero-value">37 985<span className="unit">$ CAD</span></div>
                <div className="adm-hero-trend up">↑ 23 % vs mois précédent</div>
                <div className="adm-hero-meta">après refunds · avant fees Stripe (1 184 $)</div>
                <svg className="adm-hero-spark" viewBox="0 0 320 48" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="spark-net" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="var(--success)" stop-opacity="0.28" />
                      <stop offset="100%" stop-color="var(--success)" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,40 L20,38 L40,34 L60,36 L80,30 L100,32 L120,24 L140,28 L160,22 L180,18 L200,24 L220,16 L240,14 L260,20 L280,12 L300,10 L320,6 L320,48 L0,48 Z" fill="url(#spark-net)" />
                  <polyline points="0,40 20,38 40,34 60,36 80,30 100,32 120,24 140,28 160,22 180,18 200,24 220,16 240,14 260,20 280,12 300,10 320,6" fill="none" stroke="var(--success)" stroke-width="1.5" />
                </svg>
              </div>
            </section>
      
            {/* ─── Revenue chart full-width ────────────────────────── */}
            <section className="adm-panel" style={{ marginBottom: "24px" } as React.CSSProperties}>
              <div className="adm-panel-header">
                <h2 className="adm-panel-title">
                  Revenu quotidien
                  <span className="adm-panel-title-meta">1 – 16 mai 2026 · brut vs refunds</span>
                </h2>
                <div className="adm-chart-legend">
                  <span className="adm-chart-legend-item"><span className="adm-chart-legend-swatch" style={{ background: "var(--accent-primary)" } as React.CSSProperties}></span>Revenu brut</span>
                  <span className="adm-chart-legend-item"><span className="adm-chart-legend-swatch" style={{ background: "var(--danger)" } as React.CSSProperties}></span>Refunds</span>
                </div>
              </div>
              <div className="adm-chart-full">
                <svg className="adm-chart-svg-full" viewBox="0 0 800 260" preserveAspectRatio="none">
                  {/* Y axis labels */}
                  <text x="6" y="20" className="adm-chart-y-label">4 000 $</text>
                  <text x="6" y="80" className="adm-chart-y-label">3 000 $</text>
                  <text x="6" y="140" className="adm-chart-y-label">2 000 $</text>
                  <text x="6" y="200" className="adm-chart-y-label">1 000 $</text>
                  <text x="6" y="248" className="adm-chart-y-label">0 $</text>
                  {/* Gridlines */}
                  <line x1="60" y1="16" x2="800" y2="16" stroke="var(--border-subtle)" stroke-dasharray="2 4" />
                  <line x1="60" y1="76" x2="800" y2="76" stroke="var(--border-subtle)" stroke-dasharray="2 4" />
                  <line x1="60" y1="136" x2="800" y2="136" stroke="var(--border-subtle)" stroke-dasharray="2 4" />
                  <line x1="60" y1="196" x2="800" y2="196" stroke="var(--border-subtle)" stroke-dasharray="2 4" />
                  <line x1="60" y1="244" x2="800" y2="244" stroke="var(--border-default)" />
                  {/* Revenue area */}
                  <defs>
                    <linearGradient id="rev-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="var(--accent-primary)" stop-opacity="0.24" />
                      <stop offset="100%" stop-color="var(--accent-primary)" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  {/* 16 daily points: May 1..16 */}
                  <path d="M75,180 L120,160 L165,140 L210,170 L255,120 L300,135 L345,100 L390,115 L435,90 L480,75 L525,110 L570,80 L615,65 L660,95 L705,55 L750,45 L750,244 L75,244 Z" fill="url(#rev-area)" />
                  <polyline points="75,180 120,160 165,140 210,170 255,120 300,135 345,100 390,115 435,90 480,75 525,110 570,80 615,65 660,95 705,55 750,45" fill="none" stroke="var(--accent-primary)" stroke-width="2" />
                  {/* Data points */}
                  <g fill="var(--accent-primary)">
                    <circle cx="75" cy="180" r="2.5" /><circle cx="120" cy="160" r="2.5" /><circle cx="165" cy="140" r="2.5" />
                    <circle cx="210" cy="170" r="2.5" /><circle cx="255" cy="120" r="2.5" /><circle cx="300" cy="135" r="2.5" />
                    <circle cx="345" cy="100" r="2.5" /><circle cx="390" cy="115" r="2.5" /><circle cx="435" cy="90" r="2.5" />
                    <circle cx="480" cy="75" r="2.5" /><circle cx="525" cy="110" r="2.5" /><circle cx="570" cy="80" r="2.5" />
                    <circle cx="615" cy="65" r="2.5" /><circle cx="660" cy="95" r="2.5" /><circle cx="705" cy="55" r="2.5" />
                    <circle cx="750" cy="45" r="3.5" stroke="var(--bg-surface)" stroke-width="2" />
                  </g>
                  {/* Refund bars */}
                  <g fill="var(--danger)" opacity="0.85">
                    <rect x="161" y="230" width="8" height="14" />
                    <rect x="296" y="222" width="8" height="22" />
                    <rect x="431" y="216" width="8" height="28" />
                    <rect x="566" y="228" width="8" height="16" />
                    <rect x="701" y="234" width="8" height="10" />
                  </g>
                  {/* Today marker */}
                  <line x1="750" y1="16" x2="750" y2="244" stroke="var(--accent-primary)" stroke-dasharray="3 4" stroke-opacity="0.4" />
                </svg>
                <div className="adm-chart-axis-x" style={{ paddingLeft: "64px" } as React.CSSProperties}>
                  <span>1 mai</span><span>3 mai</span><span>5 mai</span><span>7 mai</span><span>9 mai</span><span>11 mai</span><span>13 mai</span><span>16 mai · today</span>
                </div>
              </div>
            </section>
      
            {/* ─── Revenue par catégorie + Top customers ────────────── */}
            <section className="adm-grid-equal">
              <div className="adm-panel">
                <div className="adm-panel-header">
                  <h2 className="adm-panel-title">
                    Revenu par catégorie
                    <span className="adm-panel-title-meta">produit · MTD</span>
                  </h2>
                  <a href="#" className="adm-panel-link">Voir SKU →</a>
                </div>
                <div>
                  <div className="adm-cat-row">
                    <div>
                      <div className="adm-cat-head">
                        <span className="adm-cat-name">Cartes d'affaires</span>
                        <span className="adm-cat-amount">23 853 $</span>
                      </div>
                      <div className="adm-cat-bar"><div className="adm-cat-bar-fill" style={{ width: "62%", background: "var(--accent-primary)" } as React.CSSProperties}></div></div>
                    </div>
                    <div className="adm-cat-pct">62 %</div>
                  </div>
                  <div className="adm-cat-row">
                    <div>
                      <div className="adm-cat-head">
                        <span className="adm-cat-name">Flyers</span>
                        <span className="adm-cat-amount">6 925 $</span>
                      </div>
                      <div className="adm-cat-bar"><div className="adm-cat-bar-fill" style={{ width: "18%", background: "var(--info)" } as React.CSSProperties}></div></div>
                    </div>
                    <div className="adm-cat-pct">18 %</div>
                  </div>
                  <div className="adm-cat-row">
                    <div>
                      <div className="adm-cat-head">
                        <span className="adm-cat-name">Cartes postales</span>
                        <span className="adm-cat-amount">4 617 $</span>
                      </div>
                      <div className="adm-cat-bar"><div className="adm-cat-bar-fill" style={{ width: "12%", background: "var(--warning)" } as React.CSSProperties}></div></div>
                    </div>
                    <div className="adm-cat-pct">12 %</div>
                  </div>
                  <div className="adm-cat-row">
                    <div>
                      <div className="adm-cat-head">
                        <span className="adm-cat-name">Brochures</span>
                        <span className="adm-cat-amount">3 078 $</span>
                      </div>
                      <div className="adm-cat-bar"><div className="adm-cat-bar-fill" style={{ width: "8%", background: "var(--success)" } as React.CSSProperties}></div></div>
                    </div>
                    <div className="adm-cat-pct">8 %</div>
                  </div>
                </div>
              </div>
      
              <div className="adm-panel">
                <div className="adm-panel-header">
                  <h2 className="adm-panel-title">
                    Top clients
                    <span className="adm-panel-title-meta">MTD · classement par $ dépensés</span>
                  </h2>
                  <a href="admin-users.html" className="adm-panel-link">Tous les clients →</a>
                </div>
                <div>
                  <div className="adm-lead-row">
                    <span className="adm-lead-rank top">01</span>
                    <div className="adm-lead-name">
                      <span className="adm-lead-name-text">Agence Boréal</span>
                      <span className="badge badge-accent">VIP</span>
                      <span className="adm-lead-name-meta">· 8 commandes</span>
                    </div>
                    <span className="adm-lead-total">2 478 $</span>
                  </div>
                  <div className="adm-lead-row">
                    <span className="adm-lead-rank top">02</span>
                    <div className="adm-lead-name">
                      <span className="adm-lead-name-text">Studio Mirabel</span>
                      <span className="badge badge-accent">VIP</span>
                      <span className="adm-lead-name-meta">· 6 commandes</span>
                    </div>
                    <span className="adm-lead-total">1 842 $</span>
                  </div>
                  <div className="adm-lead-row">
                    <span className="adm-lead-rank top">03</span>
                    <div className="adm-lead-name">
                      <span className="adm-lead-name-text">Atelier Verre</span>
                      <span className="badge badge-accent">VIP</span>
                      <span className="adm-lead-name-meta">· 5 commandes</span>
                    </div>
                    <span className="adm-lead-total">1 215 $</span>
                  </div>
                  <div className="adm-lead-row">
                    <span className="adm-lead-rank">04</span>
                    <div className="adm-lead-name">
                      <span className="adm-lead-name-text">Boulangerie Mile-End</span>
                      <span className="badge badge-accent">VIP</span>
                      <span className="adm-lead-name-meta">· 4 commandes</span>
                    </div>
                    <span className="adm-lead-total">847 $</span>
                  </div>
                  <div className="adm-lead-row">
                    <span className="adm-lead-rank">05</span>
                    <div className="adm-lead-name">
                      <span className="adm-lead-name-text">Café Saint-Henri</span>
                      <span className="badge badge-accent">VIP</span>
                      <span className="adm-lead-name-meta">· 3 commandes</span>
                    </div>
                    <span className="adm-lead-total">612 $</span>
                  </div>
                  <div className="adm-lead-row">
                    <span className="adm-lead-rank">06</span>
                    <div className="adm-lead-name">
                      <span className="adm-lead-name-text">Maxime Roy (freelance)</span>
                      <span className="adm-lead-name-meta">· 3 commandes</span>
                    </div>
                    <span className="adm-lead-total">487 $</span>
                  </div>
                  <div className="adm-lead-row">
                    <span className="adm-lead-rank">07</span>
                    <div className="adm-lead-name">
                      <span className="adm-lead-name-text">Sophie Beauchamp</span>
                      <span className="adm-lead-name-meta">· 2 commandes</span>
                    </div>
                    <span className="adm-lead-total">374 $</span>
                  </div>
                  <div className="adm-lead-row">
                    <span className="adm-lead-rank">08</span>
                    <div className="adm-lead-name">
                      <span className="adm-lead-name-text">Marguerite Dubois</span>
                      <span className="adm-lead-name-meta">· 3 commandes</span>
                    </div>
                    <span className="adm-lead-total">298 $</span>
                  </div>
                </div>
              </div>
            </section>
      
            {/* ─── Stripe payouts + Refunds détaillés ──────────────── */}
            <section className="adm-grid-equal">
              <div className="adm-panel">
                <div className="adm-panel-header">
                  <h2 className="adm-panel-title">
                    Virements Stripe
                    <span className="adm-panel-title-meta">payouts vers compte bancaire</span>
                  </h2>
                  <a href="#" className="adm-panel-link">↗ Stripe payouts</a>
                </div>
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Date d'envoi</th>
                      <th className="num">Montant</th>
                      <th>Statut</th>
                      <th>Arrivée</th>
                      <th className="num">Charges</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="t-mono">15 mai 2026</td>
                      <td className="num">4 287,12 $</td>
                      <td><span className="badge badge-success">In transit</span></td>
                      <td className="t-mono muted">16 mai</td>
                      <td className="num">14</td>
                    </tr>
                    <tr>
                      <td className="t-mono">12 mai 2026</td>
                      <td className="num">3 916,40 $</td>
                      <td><span className="badge badge-success">Paid</span></td>
                      <td className="t-mono muted">13 mai</td>
                      <td className="num">11</td>
                    </tr>
                    <tr>
                      <td className="t-mono">8 mai 2026</td>
                      <td className="num">5 142,87 $</td>
                      <td><span className="badge badge-success">Paid</span></td>
                      <td className="t-mono muted">9 mai</td>
                      <td className="num">18</td>
                    </tr>
                    <tr>
                      <td className="t-mono">5 mai 2026</td>
                      <td className="num">2 874,55 $</td>
                      <td><span className="badge badge-success">Paid</span></td>
                      <td className="t-mono muted">6 mai</td>
                      <td className="num">9</td>
                    </tr>
                    <tr>
                      <td className="t-mono">1 mai 2026</td>
                      <td className="num">3 612,18 $</td>
                      <td><span className="badge badge-success">Paid</span></td>
                      <td className="t-mono muted">2 mai</td>
                      <td className="num">12</td>
                    </tr>
                    <tr>
                      <td className="t-mono">28 avr 2026</td>
                      <td className="num">4 015,72 $</td>
                      <td><span className="badge badge-warning">Reversed</span></td>
                      <td className="t-mono muted">— </td>
                      <td className="num">13</td>
                    </tr>
                  </tbody>
                </table>
              </div>
      
              <div className="adm-panel">
                <div className="adm-panel-header">
                  <h2 className="adm-panel-title">
                    Refunds détaillés
                    <span className="adm-panel-title-meta">5 récents · MTD</span>
                  </h2>
                  <a href="#" className="adm-panel-link">Tous les refunds →</a>
                </div>
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Order</th>
                      <th>Raison</th>
                      <th className="num">Montant</th>
                      <th>Par</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="t-mono">14 mai</td>
                      <td><span className="ref">#SIN-48289</span></td>
                      <td className="muted">Erreur de stock</td>
                      <td className="num">−54,20 $</td>
                      <td className="t-mono">PT</td>
                    </tr>
                    <tr>
                      <td className="t-mono">11 mai</td>
                      <td><span className="ref">#SIN-48201</span></td>
                      <td className="muted">Couleur non conforme</td>
                      <td className="num">−128,75 $</td>
                      <td className="t-mono">PT</td>
                    </tr>
                    <tr>
                      <td className="t-mono">7 mai</td>
                      <td><span className="ref">#SIN-48142</span></td>
                      <td className="muted">Délai dépassé · client</td>
                      <td className="num">−87,40 $</td>
                      <td className="t-mono">auto</td>
                    </tr>
                    <tr>
                      <td className="t-mono">5 mai</td>
                      <td><span className="ref">#SIN-48098</span></td>
                      <td className="muted">Annulation avant prod</td>
                      <td className="num">−42,07 $</td>
                      <td className="t-mono">PT</td>
                    </tr>
                    <tr>
                      <td className="t-mono">3 mai</td>
                      <td><span className="ref">#SIN-48054</span></td>
                      <td className="muted">Doublon de commande</td>
                      <td className="num">−175,00 $</td>
                      <td className="t-mono">PT</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
      
            {/* ─── Tax breakdown ───────────────────────────────────── */}
            <section className="adm-panel" style={{ marginBottom: "24px" } as React.CSSProperties}>
              <div className="adm-panel-header">
                <h2 className="adm-panel-title">
                  Taxes collectées par province
                  <span className="adm-panel-title-meta">MTD · prêtes à remettre</span>
                </h2>
                <span className="badge badge-info">Total 5 372 $ collectés</span>
              </div>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Province</th>
                    <th>Base imposable</th>
                    <th>Taxes appliquées</th>
                    <th className="num">Montant collecté</th>
                    <th className="num">Commandes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><span className="adm-tax-prov">QC</span></td>
                    <td className="adm-tax-base">22 487 $</td>
                    <td><span className="badge badge-neutral">TPS 5 %</span> <span className="badge badge-neutral">TVQ 9,975 %</span></td>
                    <td className="num">3 367,18 $</td>
                    <td className="num">87</td>
                  </tr>
                  <tr>
                    <td><span className="adm-tax-prov">ON</span></td>
                    <td className="adm-tax-base">9 845 $</td>
                    <td><span className="badge badge-neutral">HST 13 %</span></td>
                    <td className="num">1 279,85 $</td>
                    <td className="num">31</td>
                  </tr>
                  <tr>
                    <td><span className="adm-tax-prov">BC</span></td>
                    <td className="adm-tax-base">3 215 $</td>
                    <td><span className="badge badge-neutral">GST 5 %</span> <span className="badge badge-neutral">PST 7 %</span></td>
                    <td className="num">385,80 $</td>
                    <td className="num">12</td>
                  </tr>
                  <tr>
                    <td><span className="adm-tax-prov">AB</span></td>
                    <td className="adm-tax-base">1 942 $</td>
                    <td><span className="badge badge-neutral">GST 5 %</span></td>
                    <td className="num">97,10 $</td>
                    <td className="num">8</td>
                  </tr>
                  <tr>
                    <td><span className="adm-tax-prov">NB</span></td>
                    <td className="adm-tax-base">983 $</td>
                    <td><span className="badge badge-neutral">HST 15 %</span></td>
                    <td className="num">147,45 $</td>
                    <td className="num">4</td>
                  </tr>
                </tbody>
              </table>
            </section>
      
            {/* ─── Export footer ──────────────────────────────────── */}
            <div className="adm-export-bar">
              <div>
                <div className="adm-export-label">Exporter pour comptabilité</div>
                <div className="adm-export-desc">Tous les exports filtrent sur la période active · MTD (1 – 16 mai 2026)</div>
              </div>
              <div className="adm-export-actions">
                <span className="adm-qb-chip"><span className="adm-qb-chip-dot"></span>QuickBooks · synchro auto désactivée</span>
                <button className="btn btn-secondary btn-sm">↓ CSV ventes</button>
                <button className="btn btn-secondary btn-sm">↓ CSV taxes par province</button>
                <button className="btn btn-secondary btn-sm">↓ PDF comptable</button>
                <button className="btn btn-primary btn-sm">Connecter QuickBooks →</button>
              </div>
            </div>
      
          </main>
        </div>
    </>
  );
}
