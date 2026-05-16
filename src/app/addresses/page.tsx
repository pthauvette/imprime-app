/**
 * Auto-migrated from Open Design HTML artifact `addresses.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Adresses — Plio" };

export default function AddressesPage() {
  return (
    <>
      <div className="acct-shell">
          <aside className="acct-nav">
            <div className="acct-nav-brand">Plio.</div>
            <div className="acct-nav-section">Compte</div>
            <ul className="acct-nav-list">
              <li><a href="/orders" className="acct-nav-link">Mes commandes <span className="count">12</span></a></li>
              <li><a href="/drafts" className="acct-nav-link">Brouillons <span className="count">3</span></a></li>
              <li><a href="/addresses" className="acct-nav-link active">Adresses <span className="count">4</span></a></li>
              <li><a href="/wallet" className="acct-nav-link">Portefeuille</a></li>
              <li><a href="#" className="acct-nav-link">Paiements</a></li>
              <li><a href="#" className="acct-nav-link">Codes promo</a></li>
            </ul>
            <div className="acct-nav-section">Outils</div>
            <ul className="acct-nav-list">
              <li><a href="/order/start" className="acct-nav-link">+ Nouvelle commande</a></li>
              <li><a href="/samples" className="acct-nav-link">Demander un échantillon</a></li>
              <li><a href="/templates" className="acct-nav-link">Templates &amp; guides</a></li>
              <li><a href="#" className="acct-nav-link">Devenir reseller</a></li>
            </ul>
            <div className="acct-nav-section">Support</div>
            <ul className="acct-nav-list">
              <li><a href="#" className="acct-nav-link">Aide &amp; FAQ</a></li>
              <li><a href="#" className="acct-nav-link">Contact</a></li>
            </ul>
          </aside>
      
          <main className="acct-main">
            <div className="page-header">
              <div>
                <h1 className="page-title">Mes adresses</h1>
                <p className="page-subtitle"><strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>4 adresses</strong> sauvegardées · auto-suggestion activée pendant le checkout</p>
              </div>
              <button className="page-action">+ Ajouter une adresse</button>
            </div>
      
            <div className="addr-filter">
              <button className="active"><span>Toutes</span><span className="num">4</span></button>
              <button><span>Expédition</span><span className="num">3</span></button>
              <button><span>Facturation</span><span className="num">1</span></button>
            </div>
      
            <div className="addr-grid">
              {/* Default */}
              <div className="addr-card default">
                <div className="addr-card-header">
                  <div className="addr-card-name">
                    <div className="addr-card-icon">🏠</div>
                    <span className="addr-card-label">Maison</span>
                  </div>
                  <span className="addr-card-default-pill">Défaut</span>
                </div>
                <div className="addr-card-content">
                  <strong>Patrick Thauvette</strong>
                  <span>2055 rue Drummond</span>
                  <span>Montréal, QC H3G 2X3 · Canada</span>
                  <span className="phone">+1 514 555 0123</span>
                </div>
                <div className="addr-map"></div>
                <div className="addr-card-meta">
                  <span className="addr-card-stat"><strong>8</strong> commandes livrées ici</span>
                  <div className="addr-card-actions">
                    <button className="addr-action-btn">Modifier</button>
                    <button className="addr-action-btn danger">Retirer</button>
                  </div>
                </div>
              </div>
      
              {/* Office */}
              <div className="addr-card">
                <div className="addr-card-header">
                  <div className="addr-card-name">
                    <div className="addr-card-icon">🏢</div>
                    <span className="addr-card-label">Bureau</span>
                  </div>
                  <button className="addr-action-btn" style={{ fontSize: "10px" } as React.CSSProperties}>Définir défaut</button>
                </div>
                <div className="addr-card-content">
                  <strong>Patrick Thauvette · Démocratik</strong>
                  <span>5333 avenue Casgrain · Suite 1206</span>
                  <span>Montréal, QC H2T 1X3 · Canada</span>
                  <span className="phone">+1 514 555 0188</span>
                </div>
                <div className="addr-map"></div>
                <div className="addr-card-meta">
                  <span className="addr-card-stat"><strong>3</strong> commandes</span>
                  <div className="addr-card-actions">
                    <button className="addr-action-btn">Modifier</button>
                    <button className="addr-action-btn danger">Retirer</button>
                  </div>
                </div>
              </div>
      
              {/* Studio (client) */}
              <div className="addr-card">
                <div className="addr-card-header">
                  <div className="addr-card-name">
                    <div className="addr-card-icon">🎨</div>
                    <span className="addr-card-label">Studio Vingt-deux</span>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.04em", padding: "3px 8px", background: "var(--bg-sunken)", borderRadius: "var(--r-pill)", textTransform: "uppercase", fontWeight: "600" } as React.CSSProperties}>Client</span>
                </div>
                <div className="addr-card-content">
                  <strong>Sophie Beauchamp</strong>
                  <span>4545 rue Saint-Denis · Étage 3</span>
                  <span>Montréal, QC H2J 2L4 · Canada</span>
                  <span className="phone">+1 514 555 9947 · sophie@vingtdeux.studio</span>
                </div>
                <div className="addr-map"></div>
                <div className="addr-card-meta">
                  <span className="addr-card-stat">Livraison directe à mon client</span>
                  <div className="addr-card-actions">
                    <button className="addr-action-btn">Modifier</button>
                    <button className="addr-action-btn danger">Retirer</button>
                  </div>
                </div>
              </div>
      
              {/* Billing only */}
              <div className="addr-card">
                <div className="addr-card-header">
                  <div className="addr-card-name">
                    <div className="addr-card-icon">📄</div>
                    <span className="addr-card-label">Facturation</span>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--info)", letterSpacing: "0.04em", padding: "3px 8px", background: "var(--info-soft)", borderRadius: "var(--r-pill)", textTransform: "uppercase", fontWeight: "600" } as React.CSSProperties}>Bill only</span>
                </div>
                <div className="addr-card-content">
                  <strong>Démocratik Inc.</strong>
                  <span>5333 avenue Casgrain · Suite 1206</span>
                  <span>Montréal, QC H2T 1X3 · Canada</span>
                  <span className="phone">TPS 12345 6789 RT0001 · TVQ 1234567890 TQ0001</span>
                </div>
                <div className="addr-map"></div>
                <div className="addr-card-meta">
                  <span className="addr-card-stat">Adresse de facturation pour reçus officiels</span>
                  <div className="addr-card-actions">
                    <button className="addr-action-btn">Modifier</button>
                    <button className="addr-action-btn danger">Retirer</button>
                  </div>
                </div>
              </div>
      
              {/* Add new */}
              <div className="addr-add">
                <div className="addr-add-icon">+</div>
                <div className="addr-add-text">
                  <strong>Ajouter une adresse</strong>
                  <span>Maison, bureau, client — sauvegarde-les pour des checkouts éclair</span>
                </div>
              </div>
            </div>
          </main>
        </div>
    </>
  );
}
