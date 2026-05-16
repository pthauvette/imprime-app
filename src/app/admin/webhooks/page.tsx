/**
 * Auto-migrated from Open Design HTML artifact `admin-webhooks.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Admin — Webhooks" };

export default function AdminWebhooks() {
  return (
    <>
      <div className="adm-shell">
      
          {/* ─── SIDEBAR (identical, "Webhooks" active) ─────────── */}
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
              <li><a href="admin-webhooks.html" className="adm-nav-link active">
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
      
          {/* ─── MAIN ─────────────────────────────────────────────── */}
          <main className="adm-main">
      
            <header className="adm-topbar">
              <div>
                <h1 className="adm-page-title">Webhooks</h1>
                <p className="adm-page-subtitle">Stripe + Sinalite events · 3 échecs récents requièrent une action</p>
              </div>
              <div className="adm-topbar-actions">
                <button className="btn btn-secondary btn-sm">↻ Replay sélection</button>
                <button className="btn btn-primary btn-sm">⚡ Test endpoint</button>
              </div>
            </header>
      
            {/* ─── Health stats ─────────────────────────────────────── */}
            <section className="adm-health">
              <div className="adm-health-card">
                <div className="adm-health-label">Événements · 24 h</div>
                <div className="adm-health-value">487</div>
                <div className="adm-health-meta up">↑ 12 % vs hier</div>
              </div>
              <div className="adm-health-card">
                <div className="adm-health-label">Taux de succès</div>
                <div className="adm-health-value">99,4<span className="unit">%</span></div>
                <div className="adm-health-meta">SLA cible &gt; 99,0 % ✓</div>
              </div>
              <div className="adm-health-card">
                <div className="adm-health-label">Latence moyenne</div>
                <div className="adm-health-value">142<span className="unit">ms</span></div>
                <div className="adm-health-meta up">↓ 28 ms vs 7 j</div>
              </div>
              <div className="adm-health-card danger">
                <div className="adm-health-label">Échecs · action requise</div>
                <div className="adm-health-value danger">3</div>
                <div className="adm-health-meta down">2 Sinalite 5xx · 1 Stripe 401</div>
              </div>
            </section>
      
            {/* ─── Filter bar ────────────────────────────────────────── */}
            <div className="adm-filters">
              <div className="adm-filter-group">
                <span className="adm-filter-label">Source</span>
                <div className="adm-pills">
                  <button className="active">Tous</button>
                  <button>Stripe</button>
                  <button>Sinalite</button>
                </div>
              </div>
              <div className="adm-filter-group">
                <span className="adm-filter-label">Type</span>
                <select className="adm-select">
                  <option>Tous les events</option>
                  <option>payment_intent.succeeded</option>
                  <option>payment_intent.payment_failed</option>
                  <option>charge.refunded</option>
                  <option>charge.dispute.created</option>
                  <option>sinalite.status_update</option>
                  <option>sinalite.shipment_created</option>
                  <option>sinalite.order_error</option>
                </select>
              </div>
              <div className="adm-filter-group">
                <span className="adm-filter-label">Statut</span>
                <div className="adm-pills">
                  <button className="active">Tous</button>
                  <button>200 OK</button>
                  <button>4xx</button>
                  <button className="active danger">5xx</button>
                  <button>Retrying</button>
                </div>
              </div>
              <input className="adm-search-input" placeholder="Search event ID, e.g. evt_3NaB2gK..." />
            </div>
      
            {/* ─── Main webhooks table ──────────────────────────────── */}
            <section className="adm-panel" style={{ marginBottom: "24px" } as React.CSSProperties}>
              <table className="adm-wh-table">
                <thead>
                  <tr>
                    <th style={{ width: "36px" } as React.CSSProperties}><input type="checkbox" className="adm-wh-check" /></th>
                    <th style={{ width: "130px" } as React.CSSProperties}>Timestamp</th>
                    <th style={{ width: "80px" } as React.CSSProperties}>Source</th>
                    <th>Event type</th>
                    <th style={{ width: "130px" } as React.CSSProperties}>Order ref</th>
                    <th style={{ width: "90px" } as React.CSSProperties}>Status</th>
                    <th className="num" style={{ width: "70px" } as React.CSSProperties}>Durée</th>
                    <th style={{ width: "110px" } as React.CSSProperties}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1 */}
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 14:32:08</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">payment_intent.succeeded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48312</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">128 ms</td>
                    <td><div className="adm-wh-actions">
                      <button className="adm-wh-action" title="Replay">↻</button>
                      <button className="adm-wh-action" title="Payload">{}</button>
                      <button className="adm-wh-action" title="Inspect">↗</button>
                    </div></td>
                  </tr>
                  {/* Row 2 (expanded by default for demo) */}
                  <tr className="expanded">
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 14:31:55</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.status_update</span></td>
                    <td><span className="adm-wh-ref">#SIN-48295</span></td>
                    <td><span className="adm-wh-status s5xx">504 GW</span></td>
                    <td className="num">30 008 ms</td>
                    <td><div className="adm-wh-actions">
                      <button className="adm-wh-action" title="Replay">↻</button>
                      <button className="adm-wh-action" title="Payload">{}</button>
                      <button className="adm-wh-action" title="Inspect">↗</button>
                      <button className="adm-wh-action" title="Collapse"><svg className="adm-wh-chevron" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3l4 4-4 4" /></svg></button>
                    </div></td>
                  </tr>
                  {/* Drawer */}
                  <tr className="expanded">
                    <td colSpan={8} className="adm-wh-drawer-cell">
                      <div className="adm-wh-drawer">
                        <div>
                          <div className="adm-wh-drawer-section-title">Request headers <span className="meta">POST /api/webhooks/sinalite</span></div>
                          <pre className="adm-wh-code">&#123;
        <span className="k">"content-type"</span>: <span className="s">"application/json"</span>,
        <span className="k">"x-sinalite-signature"</span>: <span className="s">"t=1747408315,v1=8c1f..."</span>,
        <span className="k">"x-sinalite-event"</span>: <span className="s">"status_update"</span>,
        <span className="k">"x-sinalite-delivery"</span>: <span className="s">"d7e3-48295-a"</span>,
        <span className="k">"user-agent"</span>: <span className="s">"Sinalite-Webhook/1.4"</span>
      &#125;</pre>
                        </div>
                        <div>
                          <div className="adm-wh-drawer-section-title">Request body <span className="meta">216 B</span></div>
                          <pre className="adm-wh-code">&#123;
        <span className="k">"order_id"</span>: <span className="s">"SIN-48295"</span>,
        <span className="k">"status"</span>: <span className="s">"IN_PRODUCTION"</span>,
        <span className="k">"previous"</span>: <span className="s">"SUBMITTED"</span>,
        <span className="k">"production_eta"</span>: <span className="s">"2026-05-20"</span>,
        <span className="k">"line_items"</span>: [&#123;
          <span className="k">"sku"</span>: <span className="s">"BC-16PT-UV"</span>,
          <span className="k">"qty"</span>: <span className="n">250</span>
        &#125;]
      &#125;</pre>
                        </div>
                        <div>
                          <div className="adm-wh-drawer-section-title">Response body <span className="meta">5xx · timeout</span></div>
                          <pre className="adm-wh-code">&#123;
        <span className="k">"error"</span>: <span className="s">"upstream_timeout"</span>,
        <span className="k">"message"</span>: <span className="s">"Daemon /api/webhooks/sinalite did not respond within 30s"</span>,
        <span className="k">"trace_id"</span>: <span className="s">"trc_a7f2c91e..."</span>,
        <span className="k">"will_retry"</span>: <span className="b">true</span>
      &#125;</pre>
                        </div>
                        <div>
                          <div className="adm-wh-drawer-section-title">Historique des retries <span className="meta">3 tentatives auto</span></div>
                          <div className="adm-wh-retry-list">
                            <div className="adm-wh-retry-row">
                              <span className="adm-wh-retry-dot" style={{ background: "var(--danger)" } as React.CSSProperties}></span>
                              <span className="adm-wh-retry-time">14:31:55</span>
                              <span className="adm-wh-retry-msg">Tentative initiale · timeout</span>
                              <span className="adm-wh-retry-status" style={{ color: "var(--danger)" } as React.CSSProperties}>504</span>
                            </div>
                            <div className="adm-wh-retry-row">
                              <span className="adm-wh-retry-dot" style={{ background: "var(--danger)" } as React.CSSProperties}></span>
                              <span className="adm-wh-retry-time">14:33:12</span>
                              <span className="adm-wh-retry-msg">Retry #1 · backoff 75 s</span>
                              <span className="adm-wh-retry-status" style={{ color: "var(--danger)" } as React.CSSProperties}>504</span>
                            </div>
                            <div className="adm-wh-retry-row">
                              <span className="adm-wh-retry-dot" style={{ background: "var(--danger)" } as React.CSSProperties}></span>
                              <span className="adm-wh-retry-time">14:36:48</span>
                              <span className="adm-wh-retry-msg">Retry #2 · backoff 215 s</span>
                              <span className="adm-wh-retry-status" style={{ color: "var(--danger)" } as React.CSSProperties}>504</span>
                            </div>
                            <div className="adm-wh-retry-row">
                              <span className="adm-wh-retry-dot" style={{ background: "var(--warning)" } as React.CSSProperties}></span>
                              <span className="adm-wh-retry-time">14:45:02</span>
                              <span className="adm-wh-retry-msg">Retry #3 · prochaine tentative dans 8 min</span>
                              <span className="adm-wh-retry-status" style={{ color: "var(--warning)" } as React.CSSProperties}>queued</span>
                            </div>
                          </div>
                        </div>
                        <div className="adm-wh-drawer-full adm-wh-drawer-actions">
                          <button className="btn btn-primary btn-sm">↻ Replay maintenant</button>
                          <button className="btn btn-secondary btn-sm">Inspecter #SIN-48295 →</button>
                          <button className="btn btn-secondary btn-sm">Annuler les retries</button>
                          <span className="adm-wh-confirm">⚠ Une replay manuelle re-déclenchera le handler côté daemon · idempotency key respectée.</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {/* Row 3 */}
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 14:28:41</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">charge.refunded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48289</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">94 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 14:22:17</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.shipment_created</span></td>
                    <td><span className="adm-wh-ref">#SIN-48298</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">187 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 14:18:02</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">payment_intent.succeeded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48311</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">112 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 13:58:47</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.status_update</span></td>
                    <td><span className="adm-wh-ref">#SIN-48273</span></td>
                    <td><span className="adm-wh-status s5xx">500 ERR</span></td>
                    <td className="num">218 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 13:51:13</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">payment_intent.payment_failed</span></td>
                    <td><span className="adm-wh-ref">#SIN-48308</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">87 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 13:42:08</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">charge.dispute.created</span></td>
                    <td><span className="adm-wh-ref">#SIN-47921</span></td>
                    <td><span className="adm-wh-status s4xx">401 sig</span></td>
                    <td className="num">42 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 13:28:51</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.status_update</span></td>
                    <td><span className="adm-wh-ref">#SIN-48276</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">156 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 13:17:22</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">payment_intent.succeeded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48310</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">98 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 13:02:18</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.order_error</span></td>
                    <td><span className="adm-wh-ref">#SIN-48273</span></td>
                    <td><span className="adm-wh-status retry">retry 2/3</span></td>
                    <td className="num">2 481 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 12:48:42</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">charge.refunded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48201</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">102 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 12:31:07</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.status_update</span></td>
                    <td><span className="adm-wh-ref">#SIN-48298</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">142 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 12:14:32</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">payment_intent.succeeded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48309</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">118 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 11:58:21</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.shipment_created</span></td>
                    <td><span className="adm-wh-ref">#SIN-48276</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">163 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 11:42:08</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">payment_intent.succeeded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48272</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">108 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 11:23:51</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">payout.paid</span></td>
                    <td><span className="adm-wh-ref">po_3NaB12</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">76 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 10:51:14</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.status_update</span></td>
                    <td><span className="adm-wh-ref">#SIN-48142</span></td>
                    <td><span className="adm-wh-status s5xx">503 unav.</span></td>
                    <td className="num">1 042 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 10:34:22</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">payment_intent.succeeded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48307</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">94 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 10:18:07</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.status_update</span></td>
                    <td><span className="adm-wh-ref">#SIN-48295</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">138 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 09:48:31</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">charge.refunded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48098</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">112 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 09:31:42</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.shipment_created</span></td>
                    <td><span className="adm-wh-ref">#SIN-48201</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">148 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 09:12:08</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">payment_intent.succeeded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48306</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">102 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 08:42:17</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.status_update</span></td>
                    <td><span className="adm-wh-ref">#SIN-48142</span></td>
                    <td><span className="adm-wh-status retry">retry 1/3</span></td>
                    <td className="num">3 014 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 08:18:51</span></td>
                    <td><span className="adm-wh-source stripe">Stripe</span></td>
                    <td><span className="adm-wh-evt">payment_intent.succeeded</span></td>
                    <td><span className="adm-wh-ref">#SIN-48305</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">114 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                  <tr>
                    <td><input type="checkbox" className="adm-wh-check" /></td>
                    <td><span className="adm-wh-time"><span className="date">16/05</span> 07:51:32</span></td>
                    <td><span className="adm-wh-source sinalite">Sinalite</span></td>
                    <td><span className="adm-wh-evt">sinalite.status_update</span></td>
                    <td><span className="adm-wh-ref">#SIN-48283</span></td>
                    <td><span className="adm-wh-status s2xx">200 OK</span></td>
                    <td className="num">132 ms</td>
                    <td><div className="adm-wh-actions"><button className="adm-wh-action">↻</button><button className="adm-wh-action">{}</button><button className="adm-wh-action">↗</button></div></td>
                  </tr>
                </tbody>
              </table>
            </section>
      
            {/* ─── Endpoints configurés ─────────────────────────────── */}
            <section className="adm-panel">
              <div className="adm-panel-header">
                <h2 className="adm-panel-title">
                  Endpoints configurés
                  <span className="adm-panel-title-meta">2 actifs · signatures vérifiées</span>
                </h2>
                <button className="btn btn-secondary btn-sm">+ Ajouter un endpoint</button>
              </div>
              <div>
                <div className="adm-endpoint-row">
                  <div>
                    <div className="adm-endpoint-name">
                      <span className="adm-wh-source stripe">Stripe</span>
                      Production endpoint
                      <span className="badge badge-success">Active</span>
                    </div>
                    <span className="adm-endpoint-url">https://imprime.ca/api/webhooks/stripe</span>
                  </div>
                  <div className="adm-endpoint-last">
                    Dernier succès<br/>
                    <strong>il y a 2 min</strong> · 142 events / 24h
                  </div>
                  <div style={{ display: "flex", gap: "8px" } as React.CSSProperties}>
                    <button className="btn btn-secondary btn-sm">↻ Replay all (24h)</button>
                    <button className="btn btn-ghost btn-sm">…</button>
                  </div>
                </div>
                <div className="adm-endpoint-row">
                  <div>
                    <div className="adm-endpoint-name">
                      <span className="adm-wh-source sinalite">Sinalite</span>
                      Status callback
                      <span className="badge badge-warning">Dégradé</span>
                    </div>
                    <span className="adm-endpoint-url">https://imprime.ca/api/webhooks/sinalite</span>
                  </div>
                  <div className="adm-endpoint-last">
                    Dernier succès<br/>
                    <strong>il y a 18 min</strong> · 287 events / 24h · 3 échecs ouverts
                  </div>
                  <div style={{ display: "flex", gap: "8px" } as React.CSSProperties}>
                    <button className="btn btn-secondary btn-sm">↻ Replay all failed</button>
                    <button className="btn btn-ghost btn-sm">…</button>
                  </div>
                </div>
              </div>
            </section>
      
          </main>
        </div>
    </>
  );
}
