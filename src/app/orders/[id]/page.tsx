/**
 * Auto-migrated from Open Design HTML artifact `order-detail.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Suivi commande — Imprime" };

export default function OrderDetailPage() {
  return (
    <>
      <div className="acct-shell">
          <aside className="acct-nav">
            <div className="acct-nav-brand">Imprime.</div>
            <div className="acct-nav-section">Compte</div>
            <ul className="acct-nav-list">
              <li><a href="/orders" className="acct-nav-link active">Mes commandes <span className="count">12</span></a></li>
              <li><a href="#" className="acct-nav-link">Brouillons <span className="count">3</span></a></li>
              <li><a href="#" className="acct-nav-link">Adresses</a></li>
              <li><a href="#" className="acct-nav-link">Paiements</a></li>
              <li><a href="#" className="acct-nav-link">Codes promo</a></li>
            </ul>
            <div className="acct-nav-section">Outils</div>
            <ul className="acct-nav-list">
              <li><a href="/order/start" className="acct-nav-link">+ Nouvelle commande</a></li>
              <li><a href="#" className="acct-nav-link">Demander un échantillon</a></li>
              <li><a href="#" className="acct-nav-link">Templates &amp; guides</a></li>
              <li><a href="#" className="acct-nav-link">Devenir reseller</a></li>
            </ul>
            <div className="acct-nav-section">Support</div>
            <ul className="acct-nav-list">
              <li><a href="#" className="acct-nav-link">Aide &amp; FAQ</a></li>
              <li><a href="#" className="acct-nav-link">Contact</a></li>
            </ul>
          </aside>
      
          <main className="detail-main">
            <a href="/orders" className="back-link">← Toutes mes commandes</a>
      
            {/* Order header card */}
            <div className="order-header-card">
              <div className="header-mockup">
                <div className="header-mockup-stack">
                  <div className="header-mockup-card l3"></div>
                  <div className="header-mockup-card l2"></div>
                  <div className="header-mockup-card l1">
                    <div className="pcm-name">Sophie Beauchamp</div>
                    <div className="pcm-divider"></div>
                    <div className="pcm-title">Directrice créative</div>
                    <div className="pcm-meta">+1 514 555 0123</div>
                  </div>
                </div>
              </div>
              <div className="header-info">
                <div className="order-id-row">
                  <span className="order-id-big">#SIN-48201</span>
                  <span className="order-status-big">En production</span>
                </div>
                <h1 className="header-product-name">Cartes 14pt + UV High Gloss</h1>
                <div className="header-product-meta">
                  <span>1 000 unités</span><span className="sep">·</span>
                  <span>3,5 × 2"</span><span className="sep">·</span>
                  <span>Bundling 50/pack</span><span className="sep">·</span>
                  <span>Commandée 15 mai à 15:42</span>
                </div>
              </div>
              <div className="header-eta">
                <div className="header-eta-label">Arrivée prévue</div>
                <div className="header-eta-date">22 mai</div>
                <div className="header-eta-day">mardi · UPS Standard</div>
              </div>
            </div>
      
            {/* Quick actions */}
            <div className="quick-actions">
              <a href="#" className="qa-btn">
                <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.7 1 6.4 2.6L21 8" /><path d="M21 3v5h-5" /></svg>
                <div className="qa-btn-text"><div className="qa-btn-label">Re-commander</div><div className="qa-btn-meta">Avec mêmes options</div></div>
              </a>
              <a href="#" className="qa-btn">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                <div className="qa-btn-text"><div className="qa-btn-label">Télécharger facture</div><div className="qa-btn-meta">PDF · #INV-48201</div></div>
              </a>
              <a href="#" className="qa-btn">
                <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                <div className="qa-btn-text"><div className="qa-btn-label">Contacter le support</div><div className="qa-btn-meta">Réponse sous 1h</div></div>
              </a>
              <a href="#" className="qa-btn danger">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                <div className="qa-btn-text"><div className="qa-btn-label">Annuler</div><div className="qa-btn-meta">Possible avant production</div></div>
              </a>
            </div>
      
            {/* Two-column detail */}
            <div className="detail-grid">
              {/* Left column */}
              <div>
                {/* Live timeline */}
                <div className="panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Suivi en direct</h2>
                    <span className="panel-action">★ Mises à jour live</span>
                  </div>
                  <div className="live-timeline">
                    <div className="live-step done">
                      <div className="live-dot"></div>
                      <div className="live-content">
                        <div className="live-title">Commande reçue &amp; paiement confirmé</div>
                        <div className="live-meta">Visa •••• 4242 · 116,24 $ CAD · Stripe pi_3PXqwx2eZv...</div>
                      </div>
                      <span className="live-time">15 mai · 15:42</span>
                    </div>
                    <div className="live-step done">
                      <div className="live-dot"></div>
                      <div className="live-content">
                        <div className="live-title">Vérification finale du fichier (prépresse)</div>
                        <div className="live-meta">Bleed ✓ · CMYK ✓ · Fonts intégrées ✓ · Logo verso ajusté de 0,05"</div>
                      </div>
                      <span className="live-time">15 mai · 17:18</span>
                    </div>
                    <div className="live-step current">
                      <div className="live-dot"></div>
                      <div className="live-content">
                        <div className="live-title">Production en presse</div>
                        <div className="live-meta">Impression offset 4 couleurs · séchage UV en cours sur presse #4</div>
                      </div>
                      <span className="live-time">aujourd'hui · 09:00</span>
                    </div>
                    <div className="live-step">
                      <div className="live-dot">4</div>
                      <div className="live-content">
                        <div className="live-title">Coupe &amp; bundling 50/pack</div>
                        <div className="live-meta">Coupe précise au laser · regroupement par bandes papier</div>
                      </div>
                      <span className="live-time">17-18 mai</span>
                    </div>
                    <div className="live-step">
                      <div className="live-dot">5</div>
                      <div className="live-content">
                        <div className="live-title">Préparation expédition</div>
                        <div className="live-meta">Boîte 9 × 9 × 12" · poids 5,4 lb · pickup UPS</div>
                      </div>
                      <span className="live-time">19-20 mai</span>
                    </div>
                    <div className="live-step">
                      <div className="live-dot">6</div>
                      <div className="live-content">
                        <div className="live-title">En transit avec UPS</div>
                        <div className="live-meta">Tracking number envoyé par courriel à patrick@democratik.org</div>
                      </div>
                      <span className="live-time">20-21 mai</span>
                    </div>
                    <div className="live-step">
                      <div className="live-dot">7</div>
                      <div className="live-content">
                        <div className="live-title">Livrée devant ta porte</div>
                        <div className="live-meta">Signature non requise · livraison estimée matinée</div>
                      </div>
                      <span className="live-time">22 mai</span>
                    </div>
                  </div>
                </div>
      
                {/* Items */}
                <div className="panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Articles</h2>
                    <span className="panel-action">1 article · 1 000 unités</span>
                  </div>
                  <div className="items-table">
                    <div className="item-row">
                      <div className="item-thumb"><div className="item-thumb-card"></div></div>
                      <div className="item-info">
                        <div className="item-name">Cartes de visite 14pt + UV (High Gloss)</div>
                        <div className="item-options">Format 3,5 × 2" · Stock 14pt Coated · Coating UV High Gloss · 1 000 unités · 4-5 jours</div>
                      </div>
                      <div className="item-price">80,00 $</div>
                    </div>
                    <div className="item-divider"></div>
                    <div className="item-row">
                      <div></div>
                      <div className="item-info">
                        <div className="item-name" style={{ color: "var(--text-secondary)", fontWeight: "500", fontSize: "13px" } as React.CSSProperties}>└ Bundling 50/pack</div>
                        <div className="item-options">Cartes regroupées par paquets de 50 avec bandes papier</div>
                      </div>
                      <div className="item-price" style={{ color: "var(--text-secondary)" } as React.CSSProperties}>+12,00 $</div>
                    </div>
                  </div>
                </div>
      
                {/* Files */}
                <div className="panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Fichiers d'impression</h2>
                    <span className="panel-action">Validés par notre prépresse</span>
                  </div>
                  <div className="files-grid">
                    <div className="file-row">
                      <div className="file-row-thumb"><div className="file-row-thumb-inner"></div></div>
                      <div>
                        <div className="file-row-name">recto-final.pdf</div>
                        <div className="file-row-meta">2,4 MB · 300 DPI · CMYK · Bleed 0,125"</div>
                      </div>
                      <button className="file-download" title="Télécharger">
                        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                      </button>
                    </div>
                    <div className="file-row">
                      <div className="file-row-thumb dark"><div className="file-row-thumb-inner"></div></div>
                      <div>
                        <div className="file-row-name">verso-logo.pdf <span style={{ color: "var(--text-muted)", fontWeight: "400" } as React.CSSProperties}>(v2 — ajusté)</span></div>
                        <div className="file-row-meta">1,1 MB · 300 DPI · CMYK · Bleed 0,125"</div>
                      </div>
                      <button className="file-download" title="Télécharger">
                        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
      
              {/* Right column */}
              <div>
                {/* Address */}
                <div className="panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Livraison</h2>
                    <span className="panel-action">UPS Standard</span>
                  </div>
                  <div className="addr-card">
                    <strong>Patrick Thauvette</strong>
                    <span>2055 rue Drummond</span>
                    <span>Montréal, QC H3G 2X3</span>
                    <span>+1 514 555 0123</span>
                  </div>
                  <div className="addr-divider"></div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)" } as React.CSSProperties}>
                    📦 1 boîte · 9 × 9 × 12" · 5,4 lb<br />
                    🚚 Pickup UPS prévu le 20 mai
                  </div>
                  <div className="tracking-card">
                    <div className="tracking-info">
                      <span className="tracking-label">Tracking UPS</span>
                      <span className="tracking-num">Disponible le 20 mai</span>
                    </div>
                    <span className="tracking-cta" style={{ background: "var(--bg-sunken)", color: "var(--text-muted)", cursor: "not-allowed" } as React.CSSProperties}>À venir</span>
                  </div>
                </div>
      
                {/* Billing */}
                <div className="panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Facturation</h2>
                  </div>
                  <div className="addr-card">
                    <strong>Patrick Thauvette</strong>
                    <span>2055 rue Drummond, Montréal, QC H3G 2X3</span>
                    <span style={{ marginTop: "8px", fontFamily: "var(--font-mono)", fontSize: "12px" } as React.CSSProperties}>Visa •••• 4242 · expire 09/27</span>
                  </div>
                </div>
      
                {/* Total */}
                <div className="panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Récapitulatif</h2>
                  </div>
                  <div className="total-breakdown">
                    <div className="total-line"><span className="label">Sous-total impression</span><span className="value">92,00 $</span></div>
                    <div className="total-line"><span className="label">Livraison (UPS Standard)</span><span className="value">9,10 $</span></div>
                    <div className="total-line divider"><span className="label">Sous-total avant taxes</span><span className="value">101,10 $</span></div>
                    <div className="total-line"><span className="label">TPS (5 %) — Canada</span><span className="value">5,06 $</span></div>
                    <div className="total-line"><span className="label">TVQ (9,975 %) — Québec</span><span className="value">10,08 $</span></div>
                    <div className="total-line final">
                      <span className="label">Total payé</span>
                      <span className="value">116,24 $</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "center" } as React.CSSProperties}>
                    <span className="paid-badge">✓ Payé · 15 mai · 15:42</span>
                  </div>
                </div>
      
                {/* Notes */}
                <div className="panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Note de commande</h2>
                  </div>
                  <div className="notes-row">
                    « Si possible, prière de privilégier l'orientation portrait pour les paquets — j'aimerais distribuer les cartes lors d'un événement le 24 mai. Merci ! »
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
    </>
  );
}
