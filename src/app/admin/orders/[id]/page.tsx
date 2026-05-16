/**
 * Auto-migrated from Open Design HTML artifact `admin-order-detail.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Admin — Détail commande" };

export default function AdminOrderDetail() {
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
      
            <nav className="od-breadcrumb">
              <a href="admin-orders.html">← Commandes</a>
              <span style={{ color: "var(--border-strong)" } as React.CSSProperties}>/</span>
              <span className="od-breadcrumb-current">#SIN-48298</span>
            </nav>
      
            <header className="od-header">
              <div className="od-header-left">
                <h1 className="od-id-big"><span className="hash">#</span>SIN-48298</h1>
                <span className="od-status-pill">Expédiée</span>
              </div>
              <div className="od-header-meta">
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600" } as React.CSSProperties}>Total payé</div>
                  <div className="total">187,42 $ <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" } as React.CSSProperties}>CAD</span></div>
                </div>
                <span style={{ borderLeft: "1px solid var(--border-subtle)", height: "32px" } as React.CSSProperties}></span>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600" } as React.CSSProperties}>Paiement</div>
                  <div style={{ fontSize: "13px", color: "var(--text-primary)", marginTop: "4px" } as React.CSSProperties}>Visa •••• 4242</div>
                </div>
              </div>
            </header>
      
            <div className="od-grid">
      
              {/* ─── LEFT ──────────────────────────────────────────────── */}
              <div className="od-col-left">
      
                {/* Timeline */}
                <div className="od-panel">
                  <div className="od-panel-head">
                    <h2 className="od-panel-title">Historique <span className="od-panel-title-meta">8 événements</span></h2>
                    <a href="#" className="od-panel-link">Exporter JSON</a>
                  </div>
                  <div className="od-timeline">
      
                    <div className="od-tl-event">
                      <div className="od-tl-dot shipped">↗</div>
                      <div className="od-tl-body">
                        <div className="od-tl-type">SHIPMENT_DELIVERED</div>
                        <div className="od-tl-title">Livrée à Montréal QC</div>
                        <div className="od-tl-desc">UPS Standard · Signature requise · livrée à <strong>Sophie Beauchamp</strong></div>
                        <details className="od-tl-payload">
                          <summary>payload</summary>
      <pre>&#123;
        <span className="json-key">"carrier"</span>: <span className="json-str">"UPS"</span>,
        <span className="json-key">"tracking"</span>: <span className="json-str">"1Z8Y2W92039482104"</span>,
        <span className="json-key">"delivered_at"</span>: <span className="json-str">"2026-05-16T10:24:00-04:00"</span>,
        <span className="json-key">"signed_by"</span>: <span className="json-str">"S. BEAUCHAMP"</span>
      &#125;</pre>
                        </details>
                      </div>
                      <span className="od-tl-time">16 mai · 10:24</span>
                    </div>
      
                    <div className="od-tl-event">
                      <div className="od-tl-dot shipped">↗</div>
                      <div className="od-tl-body">
                        <div className="od-tl-type">SHIPMENT_IN_TRANSIT</div>
                        <div className="od-tl-title">En transit · Toronto → Montréal</div>
                        <div className="od-tl-desc">Tracking <span className="ref">1Z8Y2W92039482104</span></div>
                      </div>
                      <span className="od-tl-time">15 mai · 18:02</span>
                    </div>
      
                    <div className="od-tl-event">
                      <div className="od-tl-dot shipped">↗</div>
                      <div className="od-tl-body">
                        <div className="od-tl-type">SHIPMENT_CREATED</div>
                        <div className="od-tl-title">Étiquette d'expédition générée</div>
                        <div className="od-tl-desc">UPS Standard · 1 colis · 0,8 kg · service 3 j ouvrables</div>
                      </div>
                      <span className="od-tl-time">15 mai · 14:48</span>
                    </div>
      
                    <div className="od-tl-event">
                      <div className="od-tl-dot production">⚙</div>
                      <div className="od-tl-body">
                        <div className="od-tl-type">PRODUCTION_COMPLETE</div>
                        <div className="od-tl-title">Production terminée chez Sinalite</div>
                        <div className="od-tl-desc">Sinalite ID <span className="ref">SL-8842165</span> · usine Toronto · QA passé</div>
                      </div>
                      <span className="od-tl-time">15 mai · 11:30</span>
                    </div>
      
                    <div className="od-tl-event">
                      <div className="od-tl-dot production">⚙</div>
                      <div className="od-tl-body">
                        <div className="od-tl-type">PRODUCTION_STARTED</div>
                        <div className="od-tl-title">En production</div>
                        <div className="od-tl-desc">Prepress OK · planifié pour 36 h · Sinalite a confirmé le délai</div>
                      </div>
                      <span className="od-tl-time">14 mai · 16:12</span>
                    </div>
      
                    <div className="od-tl-event">
                      <div className="od-tl-dot submitted">→</div>
                      <div className="od-tl-body">
                        <div className="od-tl-type">SINALITE_SUBMITTED</div>
                        <div className="od-tl-title">Commande soumise à Sinalite</div>
                        <div className="od-tl-desc">Order créé chez Sinalite avec ID <span className="ref">SL-8842165</span> · attentes prepress checks</div>
                        <details className="od-tl-payload">
                          <summary>payload</summary>
      <pre>&#123;
        <span className="json-key">"sinalite_id"</span>: <span className="json-str">"SL-8842165"</span>,
        <span className="json-key">"product_code"</span>: <span className="json-str">"BC_16PT_UV_HIGH_GLOSS"</span>,
        <span className="json-key">"qty"</span>: <span className="json-num">250</span>,
        <span className="json-key">"size"</span>: <span className="json-str">"3.5x2"</span>,
        <span className="json-key">"sides"</span>: <span className="json-num">2</span>,
        <span className="json-key">"ship_to"</span>: <span className="json-str">"Montréal, QC, CA"</span>,
        <span className="json-key">"due"</span>: <span className="json-str">"2026-05-16"</span>
      &#125;</pre>
                        </details>
                      </div>
                      <span className="od-tl-time">14 mai · 10:31</span>
                    </div>
      
                    <div className="od-tl-event">
                      <div className="od-tl-dot email">✉</div>
                      <div className="od-tl-body">
                        <div className="od-tl-type">EMAIL_SENT</div>
                        <div className="od-tl-title">Confirmation de commande envoyée</div>
                        <div className="od-tl-desc">SES message <span className="ref">ses-msg-9182838</span> · delivered · opened à 10:24</div>
                      </div>
                      <span className="od-tl-time">14 mai · 10:19</span>
                    </div>
      
                    <div className="od-tl-event">
                      <div className="od-tl-dot paid">$</div>
                      <div className="od-tl-body">
                        <div className="od-tl-type">PAYMENT_SUCCEEDED</div>
                        <div className="od-tl-title">Paiement réussi · 187,42 $ CAD</div>
                        <div className="od-tl-desc">Visa •••• 4242 · PaymentIntent <span className="ref">pi_3PJh9KKkLfg2</span> · charge <span className="ref">ch_3PJh9K</span></div>
                        <details className="od-tl-payload">
                          <summary>payload</summary>
      <pre>&#123;
        <span className="json-key">"payment_intent"</span>: <span className="json-str">"pi_3PJh9KKkLfg2Cv4j1OdK28Yz"</span>,
        <span className="json-key">"amount"</span>: <span className="json-num">18742</span>,
        <span className="json-key">"currency"</span>: <span className="json-str">"cad"</span>,
        <span className="json-key">"customer"</span>: <span className="json-str">"cus_QnPx9KkLfg2Cv4"</span>,
        <span className="json-key">"status"</span>: <span className="json-str">"succeeded"</span>
      &#125;</pre>
                        </details>
                      </div>
                      <span className="od-tl-time">14 mai · 10:18</span>
                    </div>
                  </div>
                </div>
      
                {/* Items */}
                <div className="od-panel">
                  <div className="od-panel-head">
                    <h2 className="od-panel-title">Articles <span className="od-panel-title-meta">1 article · 250 unités</span></h2>
                  </div>
                  <div>
                    <div className="od-item">
                      <div className="od-item-thumb">3,5×2</div>
                      <div className="od-item-info">
                        <h3 className="od-item-name">Cartes d'affaires premium 16pt</h3>
                        <div className="od-item-opts">
                          <span className="od-chip"><strong>Stock</strong> 16pt</span>
                          <span className="od-chip"><strong>Coating</strong> UV high gloss</span>
                          <span className="od-chip"><strong>Size</strong> 3,5×2</span>
                          <span className="od-chip"><strong>Sides</strong> 2 (R/V)</span>
                          <span className="od-chip"><strong>Coupe</strong> droite</span>
                          <span className="od-chip"><strong>Qty</strong> 250</span>
                        </div>
                      </div>
                      <div className="od-item-price">
                        <div className="od-item-price-unit">0,72 $/u</div>
                        <div className="od-item-price-sub">180,00 $</div>
                      </div>
                    </div>
                  </div>
                </div>
      
                {/* Files */}
                <div className="od-panel">
                  <div className="od-panel-head">
                    <h2 className="od-panel-title">Fichiers d'impression <span className="od-panel-title-meta">2 PDF · prepress validé</span></h2>
                    <a href="#" className="od-panel-link">↓ Télécharger tout</a>
                  </div>
                  <div className="od-files">
                    <div className="od-file">
                      <div className="od-file-thumb">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 3h11l5 5v13H4z" /><path d="M15 3v5h5" /><path d="M8 14h8M8 17h5" /></svg>
                        <span className="face">Recto</span>
                      </div>
                      <div className="od-file-meta">
                        <div className="od-file-name">beauchamp_bc_recto_v2.pdf</div>
                        <div className="od-file-specs">
                          <span>3,75×2,25 in</span>
                          <span>1,8 MB</span>
                          <span>300 DPI</span>
                        </div>
                        <div className="od-file-checks">
                          <span className="od-check">CMYK</span>
                          <span className="od-check">Bleed 0,125"</span>
                          <span className="od-check">Fonts embedded</span>
                        </div>
                      </div>
                    </div>
                    <div className="od-file">
                      <div className="od-file-thumb">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 3h11l5 5v13H4z" /><path d="M15 3v5h5" /><path d="M8 14h8M8 17h5" /></svg>
                        <span className="face">Verso</span>
                      </div>
                      <div className="od-file-meta">
                        <div className="od-file-name">beauchamp_bc_verso_v2.pdf</div>
                        <div className="od-file-specs">
                          <span>3,75×2,25 in</span>
                          <span>1,2 MB</span>
                          <span>300 DPI</span>
                        </div>
                        <div className="od-file-checks">
                          <span className="od-check">CMYK</span>
                          <span className="od-check">Bleed 0,125"</span>
                          <span className="od-check">Fonts embedded</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      
              {/* ─── RIGHT ─────────────────────────────────────────────── */}
              <aside className="od-col-right">
      
                {/* Customer */}
                <div className="od-card">
                  <div className="od-card-label">Client</div>
                  <div className="od-customer-card">
                    <div className="od-customer-avatar">SB</div>
                    <div>
                      <div className="od-customer-name">Sophie Beauchamp</div>
                      <div className="od-customer-email">sophie@boreal.studio</div>
                    </div>
                    <div className="od-customer-extras">
                      <div className="row"><span className="label">Téléphone</span><span>+1 (514) 555-0182</span></div>
                      <div className="row"><span className="label">LTV</span><span>1 847 $ · 7 commandes</span></div>
                      <div className="row"><span className="label">Inscrit</span><span>14 fév 2026</span></div>
                      <div className="row" style={{ marginTop: "4px" } as React.CSSProperties}>
                        <a href="admin-user-detail.html" className="od-customer-link">Voir profil complet →</a>
                      </div>
                    </div>
                  </div>
                </div>
      
                {/* Shipping address */}
                <div className="od-card">
                  <div className="od-card-label">Adresse d'expédition</div>
                  <div className="od-addr">
                    <div className="name">Sophie Beauchamp</div>
                    <div>Boréal Studio</div>
                    <div>4218 rue Saint-Denis, app. 3</div>
                    <div>Montréal, QC  H2J 2L1</div>
                    <div>Canada</div>
                    <div className="meta">UPS Standard · 3 j ouvrables · 14,50 $</div>
                  </div>
                </div>
      
                {/* Billing summary */}
                <div className="od-card">
                  <div className="od-card-label">Facturation</div>
                  <div className="od-summary">
                    <div className="row"><span className="label">Sous-total</span><span className="value">160,00 $</span></div>
                    <div className="row"><span className="label">Livraison</span><span className="value">14,50 $</span></div>
                    <div className="row"><span className="label">TPS (5 %)</span><span className="value">8,73 $</span></div>
                    <div className="row"><span className="label">TVQ (9,975 %)</span><span className="value">17,40 $</span></div>
                    <div className="row"><span className="label" style={{ color: "var(--success)" } as React.CSSProperties}>Code RABAIS-10</span><span className="value" style={{ color: "var(--success)" } as React.CSSProperties}>−13,21 $</span></div>
                    <div className="od-summary-total">
                      <span className="label">Total CAD</span>
                      <span className="value">187,42 $</span>
                    </div>
                  </div>
                </div>
      
                {/* Sinalite */}
                <div className="od-card">
                  <div className="od-card-label">↗ Sinalite</div>
                  <div className="od-kv">
                    <div className="row"><span className="label">Order ID</span><span className="value">SL-8842165</span></div>
                    <div className="row"><span className="label">Status</span><span className="value" style={{ color: "var(--success)" } as React.CSSProperties}>SHIPPED</span></div>
                    <div className="row"><span className="label">Last sync</span><span className="value">il y a 32 min</span></div>
                    <div className="row" style={{ marginTop: "4px" } as React.CSSProperties}><a href="#" className="value-link">Ouvrir dans portail Sinalite ↗</a></div>
                  </div>
                </div>
      
                {/* Stripe */}
                <div className="od-card">
                  <div className="od-card-label">↗ Stripe</div>
                  <div className="od-kv">
                    <div className="row"><span className="label">PaymentIntent</span><span className="value" style={{ fontSize: "10.5px" } as React.CSSProperties}>pi_3PJh9KKkLfg2…</span></div>
                    <div className="row"><span className="label">Charge</span><span className="value" style={{ fontSize: "10.5px" } as React.CSSProperties}>ch_3PJh9K6L02…</span></div>
                    <div className="row"><span className="label">Customer</span><span className="value" style={{ fontSize: "10.5px" } as React.CSSProperties}>cus_QnPx9KkLfg…</span></div>
                    <div className="row"><span className="label">Risk score</span><span className="value" style={{ color: "var(--success)" } as React.CSSProperties}>12 / 100 · normal</span></div>
                    <div className="row" style={{ marginTop: "4px" } as React.CSSProperties}><a href="#" className="value-link">Ouvrir dans Stripe ↗</a></div>
                  </div>
                </div>
      
                {/* Actions */}
                <div className="od-card od-actions-card">
                  <div className="od-card-label">Actions</div>
                  <button className="od-action-btn">
                    <span>✉ Renvoyer email confirmation</span>
                    <span className="kbd">⌘E</span>
                  </button>
                  <button className="od-action-btn">
                    <span>🔄 Resync Sinalite status</span>
                    <span className="kbd">⌘S</span>
                  </button>
                  <button className="od-action-btn">
                    <span>↻ Replay webhook</span>
                    <span className="kbd">⌘R</span>
                  </button>
                  <button className="od-action-btn">
                    <span>↗ Ouvrir tracking UPS</span>
                  </button>
      
                  <div className="od-action-divider"></div>
                  <div className="od-action-danger-label">Zone dangereuse</div>
                  <button className="od-action-btn danger">
                    <span>↩ Émettre un refund</span>
                    <span className="kbd">⌘F</span>
                  </button>
                  <button className="od-action-btn danger">
                    <span>✕ Annuler commande</span>
                  </button>
                </div>
      
              </aside>
            </div>
      
          </main>
        </div>
    </>
  );
}
