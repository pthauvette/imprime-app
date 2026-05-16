/**
 * Auto-migrated from Open Design HTML artifact `admin-dashboard.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Admin — Tableau de bord" };

export default function AdminDashboard() {
  return (
    <>
      <div className="adm-shell">
      
          {/* ─── ADMIN SIDEBAR ─────────────────────────────────────────── */}
          <aside className="adm-nav">
            <div className="adm-nav-brand">
              <span className="adm-nav-brand-mark">Plio.</span>
              <span className="adm-nav-brand-tag">Admin</span>
            </div>
      
            <div className="adm-nav-section">Opérations</div>
            <ul className="adm-nav-list">
              <li><a href="admin-dashboard.html" className="adm-nav-link active">
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
                <h1 className="adm-page-title">Bonjour, <em style={{ color: "var(--accent-primary)" } as React.CSSProperties}>Patrick.</em></h1>
                <p className="adm-page-subtitle">Vendredi 16 mai 2026 · Vue d'ensemble des 24 dernières heures</p>
              </div>
              <div className="adm-topbar-actions">
                <span className="adm-pulse">Live · Sinalite OK · Stripe OK · SES OK</span>
                <button className="btn btn-secondary btn-sm">↗ Stripe Dashboard</button>
                <button className="btn btn-primary btn-sm">+ Action rapide <kbd>⌘K</kbd></button>
              </div>
            </header>
      
            {/* ─── KPI Cards ───────────────────────────────────────────── */}
            <section className="adm-stats">
              <div className="adm-stat-card">
                <div className="adm-stat-label">Revenu — 24h</div>
                <div className="adm-stat-value">2 847<span className="unit">$ CAD</span></div>
                <div className="adm-stat-trend up">↑ 18 % vs hier · 7 commandes</div>
                <svg className="adm-stat-spark" viewBox="0 0 80 26" preserveAspectRatio="none">
                  <polyline points="0,20 10,18 20,14 30,16 40,12 50,8 60,10 70,6 80,4" fill="none" stroke="var(--success)" stroke-width="1.5" />
                </svg>
              </div>
              <div className="adm-stat-card">
                <div className="adm-stat-label">Commandes — 24h</div>
                <div className="adm-stat-value">12<span className="unit">payées · 3 en attente</span></div>
                <div className="adm-stat-trend up">↑ 3 vs hier · panier moyen 237 $</div>
                <svg className="adm-stat-spark" viewBox="0 0 80 26" preserveAspectRatio="none">
                  <polyline points="0,18 10,16 20,18 30,12 40,14 50,10 60,8 70,12 80,6" fill="none" stroke="var(--accent-primary)" stroke-width="1.5" />
                </svg>
              </div>
              <div className="adm-stat-card">
                <div className="adm-stat-label">Production Sinalite</div>
                <div className="adm-stat-value">47<span className="unit">orders en cours</span></div>
                <div className="adm-stat-trend neutral">3,2 j de moyenne pour SHIPPED</div>
                <svg className="adm-stat-spark" viewBox="0 0 80 26" preserveAspectRatio="none">
                  <polyline points="0,12 10,14 20,10 30,12 40,8 50,10 60,12 70,8 80,10" fill="none" stroke="var(--info)" stroke-width="1.5" />
                </svg>
              </div>
              <div className="adm-stat-card">
                <div className="adm-stat-label">Taux d'incident</div>
                <div className="adm-stat-value">0,8<span className="unit">% · 1 refund</span></div>
                <div className="adm-stat-trend down">↓ 0,4 pts vs 7 j · cible &lt; 1,5 %</div>
                <svg className="adm-stat-spark" viewBox="0 0 80 26" preserveAspectRatio="none">
                  <polyline points="0,8 10,10 20,12 30,8 40,14 50,12 60,16 70,18 80,22" fill="none" stroke="var(--warning)" stroke-width="1.5" />
                </svg>
              </div>
            </section>
      
            {/* ─── Revenue + Activity ───────────────────────────────────── */}
            <section className="adm-grid-2">
              <div className="adm-panel">
                <div className="adm-panel-header">
                  <h2 className="adm-panel-title">
                    Revenu net
                    <span className="adm-panel-title-meta">30 derniers jours</span>
                  </h2>
                  <a href="admin-finances.html" className="adm-panel-link">Détails finances →</a>
                </div>
                <div className="adm-chart">
                  <div className="adm-chart-totals">
                    <div>
                      <div className="adm-chart-total-value">68 412 $</div>
                      <div className="adm-chart-total-label">Revenu net 30 j (CAD)</div>
                    </div>
                    <div style={{ textAlign: "right", color: "var(--success)", fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: "600", marginLeft: "auto" } as React.CSSProperties}>
                      ↑ 24 % vs 30 j précédents
                    </div>
                  </div>
                  <svg className="adm-chart-svg" viewBox="0 0 600 200" preserveAspectRatio="none">
                    {/* Gridlines */}
                    <line x1="0" y1="40" x2="600" y2="40" stroke="var(--border-subtle)" stroke-dasharray="2 4" />
                    <line x1="0" y1="100" x2="600" y2="100" stroke="var(--border-subtle)" stroke-dasharray="2 4" />
                    <line x1="0" y1="160" x2="600" y2="160" stroke="var(--border-subtle)" stroke-dasharray="2 4" />
                    {/* Area chart */}
                    <defs>
                      <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--accent-primary)" stop-opacity="0.24" />
                        <stop offset="100%" stop-color="var(--accent-primary)" stop-opacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0,160 L20,150 L40,140 L60,148 L80,130 L100,135 L120,118 L140,125 L160,100 L180,110 L200,95 L220,88 L240,72 L260,90 L280,75 L300,68 L320,58 L340,75 L360,62 L380,50 L400,55 L420,40 L440,52 L460,38 L480,30 L500,42 L520,28 L540,20 L560,22 L580,18 L600,12 L600,200 L0,200 Z" fill="url(#rev-grad)" />
                    <polyline points="0,160 20,150 40,140 60,148 80,130 100,135 120,118 140,125 160,100 180,110 200,95 220,88 240,72 260,90 280,75 300,68 320,58 340,75 360,62 380,50 400,55 420,40 440,52 460,38 480,30 500,42 520,28 540,20 560,22 580,18 600,12" fill="none" stroke="var(--accent-primary)" stroke-width="2" />
                    {/* Today marker */}
                    <circle cx="600" cy="12" r="4" fill="var(--accent-primary)" />
                    <circle cx="600" cy="12" r="8" fill="none" stroke="var(--accent-primary)" stroke-opacity="0.3" stroke-width="2" />
                  </svg>
                  <div className="adm-chart-axis">
                    <span>17 avr</span>
                    <span>24 avr</span>
                    <span>1 mai</span>
                    <span>8 mai</span>
                    <span>aujourd'hui</span>
                  </div>
                </div>
              </div>
      
              <div className="adm-panel">
                <div className="adm-panel-header">
                  <h2 className="adm-panel-title">
                    Alertes
                    <span className="adm-panel-title-meta">action requise</span>
                  </h2>
                  <span className="badge badge-danger">3 ouvertes</span>
                </div>
                <div className="adm-alerts">
                  <div className="adm-alert">
                    <div className="adm-alert-ico danger">!</div>
                    <div className="adm-alert-body">
                      <p><strong>Webhook Sinalite échoué</strong> — order <span className="t-mono" style={{ color: "var(--text-muted)" } as React.CSSProperties}>#SIN-48295</span> bloqué en SUBMITTED depuis 4h</p>
                      <div className="adm-alert-actions">
                        <a href="#" className="adm-alert-action">Replay webhook</a>
                        <a href="#" className="adm-alert-action">Voir order</a>
                      </div>
                    </div>
                  </div>
                  <div className="adm-alert">
                    <div className="adm-alert-ico warning">⚠</div>
                    <div className="adm-alert-body">
                      <p><strong>SES quota à 78 %</strong> — 4 220 / 5 400 emails envoyés ce mois-ci</p>
                      <div className="adm-alert-actions">
                        <a href="#" className="adm-alert-action">Request quota increase</a>
                      </div>
                    </div>
                  </div>
                  <div className="adm-alert">
                    <div className="adm-alert-ico info">i</div>
                    <div className="adm-alert-body">
                      <p><strong>3 commandes guest pending account</strong> — emails non-claimed depuis 7 j</p>
                      <div className="adm-alert-actions">
                        <a href="#" className="adm-alert-action">Relancer par email</a>
                        <a href="#" className="adm-alert-action danger">Ignorer</a>
                      </div>
                    </div>
                  </div>
                  <div className="adm-alert">
                    <div className="adm-alert-ico info">i</div>
                    <div className="adm-alert-body">
                      <p><strong>Neon DB</strong> — 142 / 500 MB utilisés sur le free tier</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
      
            {/* ─── Activity feed + Order status ────────────────────────── */}
            <section className="adm-grid-2">
              <div className="adm-panel">
                <div className="adm-panel-header">
                  <h2 className="adm-panel-title">
                    Activité récente
                    <span className="adm-panel-title-meta">flux temps réel</span>
                  </h2>
                  <a href="admin-orders.html" className="adm-panel-link">Toutes les commandes →</a>
                </div>
                <div className="adm-feed">
                  <div className="adm-feed-row">
                    <div className="adm-feed-dot paid">$</div>
                    <div className="adm-feed-text">
                      <span className="order-ref">#SIN-48312</span> <strong>Sophie Beauchamp</strong> a payé <strong>187,42 $</strong> · 250 × cartes 16pt UV
                    </div>
                    <span className="adm-feed-time">Il y a 4 min</span>
                  </div>
                  <div className="adm-feed-row">
                    <div className="adm-feed-dot shipped">↗</div>
                    <div className="adm-feed-text">
                      <span className="order-ref">#SIN-48298</span> Expédiée vers <strong>Montréal QC</strong> · UPS Standard · <span className="muted">tracking 1Z8Y2W…</span>
                    </div>
                    <span className="adm-feed-time">Il y a 12 min</span>
                  </div>
                  <div className="adm-feed-row">
                    <div className="adm-feed-dot submitted">→</div>
                    <div className="adm-feed-text">
                      <span className="order-ref">#SIN-48311</span> Soumise à Sinalite · <strong>Maxime Roy</strong> · 500 × flyers 8,5×11
                    </div>
                    <span className="adm-feed-time">Il y a 19 min</span>
                  </div>
                  <div className="adm-feed-row">
                    <div className="adm-feed-dot paid">$</div>
                    <div className="adm-feed-text">
                      <span className="order-ref">#SIN-48310</span> <strong>Marguerite Dubois</strong> · <strong>78,12 $</strong> · 100 × cartes 14pt matte
                    </div>
                    <span className="adm-feed-time">Il y a 26 min</span>
                  </div>
                  <div className="adm-feed-row">
                    <div className="adm-feed-dot refund">↩</div>
                    <div className="adm-feed-text">
                      <span className="order-ref">#SIN-48289</span> Refund émis <strong>54,20 $</strong> · raison : <span className="muted">erreur de stock</span>
                    </div>
                    <span className="adm-feed-time">Il y a 48 min</span>
                  </div>
                  <div className="adm-feed-row">
                    <div className="adm-feed-dot shipped">↗</div>
                    <div className="adm-feed-text">
                      <span className="order-ref">#SIN-48276</span> Livrée · <strong>Québec QC</strong> · délai final 2 j ouvrables
                    </div>
                    <span className="adm-feed-time">Il y a 1 h</span>
                  </div>
                  <div className="adm-feed-row">
                    <div className="adm-feed-dot failed">✕</div>
                    <div className="adm-feed-text">
                      <span className="order-ref">#SIN-48273</span> Sinalite ERROR · <strong>Atelier Verre</strong> · <span className="muted">prepress: bleed manquant</span>
                    </div>
                    <span className="adm-feed-time">Il y a 2 h</span>
                  </div>
                  <div className="adm-feed-row">
                    <div className="adm-feed-dot paid">$</div>
                    <div className="adm-feed-text">
                      <span className="order-ref">#SIN-48272</span> <strong>Agence Boréal</strong> · <strong>312,00 $</strong> · 1 000 × cartes postales 5×7
                    </div>
                    <span className="adm-feed-time">Il y a 2 h</span>
                  </div>
                </div>
              </div>
      
              <div className="adm-panel">
                <div className="adm-panel-header">
                  <h2 className="adm-panel-title">
                    Pipeline commandes
                    <span className="adm-panel-title-meta">142 actives</span>
                  </h2>
                  <a href="admin-orders.html?status=ALL" className="adm-panel-link">Filtres →</a>
                </div>
                <div className="adm-status-grid">
                  <div className="adm-status-row">
                    <span className="adm-status-label">
                      <span className="adm-status-dot" style={{ background: "var(--info)" } as React.CSSProperties}></span>
                      Payée
                    </span>
                    <div className="adm-status-bar">
                      <div className="adm-status-bar-fill" style={{ width: "22%", background: "var(--info)" } as React.CSSProperties}></div>
                    </div>
                    <span className="adm-status-count">14</span>
                  </div>
                  <div className="adm-status-row">
                    <span className="adm-status-label">
                      <span className="adm-status-dot" style={{ background: "var(--accent-primary)" } as React.CSSProperties}></span>
                      Soumise
                    </span>
                    <div className="adm-status-bar">
                      <div className="adm-status-bar-fill" style={{ width: "14%", background: "var(--accent-primary)" } as React.CSSProperties}></div>
                    </div>
                    <span className="adm-status-count">9</span>
                  </div>
                  <div className="adm-status-row">
                    <span className="adm-status-label">
                      <span className="adm-status-dot" style={{ background: "var(--warning)" } as React.CSSProperties}></span>
                      Production
                    </span>
                    <div className="adm-status-bar">
                      <div className="adm-status-bar-fill" style={{ width: "56%", background: "var(--warning)" } as React.CSSProperties}></div>
                    </div>
                    <span className="adm-status-count">38</span>
                  </div>
                  <div className="adm-status-row">
                    <span className="adm-status-label">
                      <span className="adm-status-dot" style={{ background: "var(--success)" } as React.CSSProperties}></span>
                      Expédiée
                    </span>
                    <div className="adm-status-bar">
                      <div className="adm-status-bar-fill" style={{ width: "76%", background: "var(--success)" } as React.CSSProperties}></div>
                    </div>
                    <span className="adm-status-count">52</span>
                  </div>
                  <div className="adm-status-row">
                    <span className="adm-status-label">
                      <span className="adm-status-dot" style={{ background: "var(--text-muted)" } as React.CSSProperties}></span>
                      Livrée (7 j)
                    </span>
                    <div className="adm-status-bar">
                      <div className="adm-status-bar-fill" style={{ width: "38%", background: "var(--text-muted)" } as React.CSSProperties}></div>
                    </div>
                    <span className="adm-status-count">26</span>
                  </div>
                  <div className="adm-status-row">
                    <span className="adm-status-label">
                      <span className="adm-status-dot" style={{ background: "var(--danger)" } as React.CSSProperties}></span>
                      Échec / refund
                    </span>
                    <div className="adm-status-bar">
                      <div className="adm-status-bar-fill" style={{ width: "4%", background: "var(--danger)" } as React.CSSProperties}></div>
                    </div>
                    <span className="adm-status-count">3</span>
                  </div>
                </div>
                <div style={{ padding: "0 22px 22px", display: "grid", gap: "6px", borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" } as React.CSSProperties}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600" } as React.CSSProperties}>SLA Production</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px" } as React.CSSProperties}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: "32px", lineHeight: "1", color: "var(--accent-primary)" } as React.CSSProperties}>3,2 j</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)" } as React.CSSProperties}>moyenne PAID → SHIPPED · cible &lt; 4 j ✓</span>
                  </div>
                </div>
              </div>
            </section>
      
            {/* ─── Quick actions ────────────────────────────────────────── */}
            <section>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px" } as React.CSSProperties}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "24px", letterSpacing: "-0.01em", margin: "0", fontWeight: "400" } as React.CSSProperties}>Actions rapides</h2>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600" } as React.CSSProperties}>Raccourci ⌘K · accessibles partout</span>
              </div>
              <div className="adm-quick">
                <button className="adm-quick-card">
                  <div className="adm-quick-card-label">↻ Replay webhook</div>
                  <div className="adm-quick-card-desc">Re-déclenche un événement Stripe ou Sinalite par ID.</div>
                  <div className="adm-quick-card-kbd"><kbd>⌘</kbd> <kbd>R</kbd></div>
                </button>
                <button className="adm-quick-card">
                  <div className="adm-quick-card-label">💰 Émettre un refund</div>
                  <div className="adm-quick-card-desc">Refund complet ou partiel via Stripe + note au client.</div>
                  <div className="adm-quick-card-kbd"><kbd>⌘</kbd> <kbd>F</kbd></div>
                </button>
                <button className="adm-quick-card">
                  <div className="adm-quick-card-label">✉ Renvoyer confirmation</div>
                  <div className="adm-quick-card-desc">Re-shoot l'email order-confirmation via SES.</div>
                  <div className="adm-quick-card-kbd"><kbd>⌘</kbd> <kbd>E</kbd></div>
                </button>
                <button className="adm-quick-card">
                  <div className="adm-quick-card-label">🔄 Sync catalogue Sinalite</div>
                  <div className="adm-quick-card-desc">Refresh la liste produits + variants index.</div>
                  <div className="adm-quick-card-kbd"><kbd>⌘</kbd> <kbd>S</kbd></div>
                </button>
              </div>
            </section>
      
          </main>
        </div>
    </>
  );
}
