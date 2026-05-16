/**
 * Auto-migrated from Open Design HTML artifact `payments.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Paiements — Plio" };

export default function PaymentsPage() {
  return (
    <>
      <div className="acct-shell">
          <aside className="acct-nav">
            <div className="acct-nav-brand">Plio.</div>
            <div className="acct-nav-section">Compte</div>
            <ul className="acct-nav-list">
              <li><a href="/orders" className="acct-nav-link">Mes commandes <span className="count">12</span></a></li>
              <li><a href="/drafts" className="acct-nav-link">Brouillons <span className="count">3</span></a></li>
              <li><a href="/addresses" className="acct-nav-link">Adresses <span className="count">4</span></a></li>
              <li><a href="/wallet" className="acct-nav-link">Portefeuille</a></li>
              <li><a href="/payments" className="acct-nav-link active">Paiements</a></li>
              <li><a href="#" className="acct-nav-link">Codes promo</a></li>
            </ul>
            <div className="acct-nav-section">Outils</div>
            <ul className="acct-nav-list">
              <li><a href="/order/start" className="acct-nav-link">+ Nouvelle commande</a></li>
              <li><a href="/samples" className="acct-nav-link">Demander un échantillon</a></li>
              <li><a href="/templates" className="acct-nav-link">Templates &amp; guides</a></li>
              <li><a href="/reseller" className="acct-nav-link">Devenir reseller</a></li>
            </ul>
            <div className="acct-nav-section">Support</div>
            <ul className="acct-nav-list">
              <li><a href="/help" className="acct-nav-link">Aide &amp; FAQ</a></li>
              <li><a href="#" className="acct-nav-link">Contact</a></li>
            </ul>
          </aside>
      
          <main className="acct-main">
            <h1 className="page-title">Paiements</h1>
            <p className="page-subtitle"><strong>2 méthodes</strong> enregistrées · 24 transactions sur les 12 derniers mois · sécurisé par Stripe</p>
      
            {/* Stats */}
            <div className="pay-stats">
              <div className="stat-card">
                <div className="stat-label">Total payé en 2026</div>
                <div className="stat-value">2 042,<span style={{ fontSize: "0.6em", color: "var(--text-secondary)" } as React.CSSProperties}>80 $</span></div>
                <div className="stat-trend up">▲ 18 % vs 2025</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Recharges wallet</div>
                <div className="stat-value">2 500 $</div>
                <div className="stat-trend">3 recharges</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Remboursements</div>
                <div className="stat-value">68 $</div>
                <div className="stat-trend">1 annulation</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Frais de transaction</div>
                <div className="stat-value">0 $</div>
                <div className="stat-trend up">Wallet activé</div>
              </div>
            </div>
      
            {/* Methods + Recent */}
            <div className="two-col">
              {/* Payment methods */}
              <div className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">Cartes &amp; méthodes</h2>
                  <span className="panel-action">+ Ajouter</span>
                </div>
                <div className="pm-list">
                  <div className="pm-card default">
                    <div className="pm-card-content">
                      <div className="pm-card-top">
                        <span className="pm-brand-label">VISA</span>
                        <span className="pm-default-badge">★ Défaut</span>
                      </div>
                      <div className="pm-card-number">•••• •••• •••• 4242</div>
                      <div className="pm-card-bottom">
                        <div><span className="label">Détenteur</span><span className="value">P. THAUVETTE</span></div>
                        <div><span className="label">Expire</span><span className="value">09 / 27</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="pm-card secondary">
                    <div className="pm-card-content">
                      <div className="pm-card-top">
                        <span className="pm-brand-label">MASTERCARD</span>
                      </div>
                      <div className="pm-card-number">•••• •••• •••• 8801</div>
                      <div className="pm-card-bottom">
                        <div><span className="label">Détenteur</span><span className="value">DÉMOCRATIK INC.</span></div>
                        <div><span className="label">Expire</span><span className="value">02 / 28</span></div>
                      </div>
                    </div>
                  </div>
                  <button className="add-method">+ Ajouter une carte ou PayPal</button>
                </div>
              </div>
      
              {/* Recent transactions */}
              <div className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">Transactions Stripe</h2>
                  <div className="filter-pills">
                    <div className="filter-pill active">Toutes</div>
                    <div className="filter-pill">Charges</div>
                    <div className="filter-pill">Remboursements</div>
                  </div>
                </div>
                <div className="tx-list">
                  <div className="tx-row">
                    <div className="tx-icon recharge">+</div>
                    <div className="tx-info">
                      <div className="tx-title">Recharge wallet 1 000 $ + 50 $ bonus</div>
                      <div className="tx-meta">Visa •••• 4242</div>
                    </div>
                    <div className="tx-stripe-id">pi_3PXqw...</div>
                    <div className="tx-status succeeded">Succeeded</div>
                    <div className="tx-amount in">+1 050,00 $</div>
                    <button className="tx-receipt" title="Reçu Stripe">
                      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    </button>
                  </div>
                  <div className="tx-row">
                    <div className="tx-icon charge">→</div>
                    <div className="tx-info">
                      <div className="tx-title">Commande #SIN-48102 — Cartes Foil</div>
                      <div className="tx-meta">Visa •••• 4242 · 187,60 $</div>
                    </div>
                    <div className="tx-stripe-id">pi_3PWmj...</div>
                    <div className="tx-status succeeded">Succeeded</div>
                    <div className="tx-amount out">187,60 $</div>
                    <button className="tx-receipt" title="Reçu">
                      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    </button>
                  </div>
                  <div className="tx-row">
                    <div className="tx-icon refund">↺</div>
                    <div className="tx-info">
                      <div className="tx-title">Remboursement #SIN-47602</div>
                      <div className="tx-meta">Bannière vinyle · annulée</div>
                    </div>
                    <div className="tx-stripe-id">re_3PVfg...</div>
                    <div className="tx-status refunded">Refunded</div>
                    <div className="tx-amount in">+68,00 $</div>
                    <button className="tx-receipt">
                      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    </button>
                  </div>
                  <div className="tx-row">
                    <div className="tx-icon recharge">+</div>
                    <div className="tx-info">
                      <div className="tx-title">Recharge wallet 500 $ + 15 $ bonus</div>
                      <div className="tx-meta">PayPal</div>
                    </div>
                    <div className="tx-stripe-id">pi_3PUab...</div>
                    <div className="tx-status succeeded">Succeeded</div>
                    <div className="tx-amount in">+515,00 $</div>
                    <button className="tx-receipt">
                      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    </button>
                  </div>
                  <div className="tx-row">
                    <div className="tx-icon recharge">+</div>
                    <div className="tx-info">
                      <div className="tx-title">Recharge initiale 1 000 $</div>
                      <div className="tx-meta">Visa •••• 4242 · première recharge</div>
                    </div>
                    <div className="tx-stripe-id">pi_3PT01...</div>
                    <div className="tx-status succeeded">Succeeded</div>
                    <div className="tx-amount in">+1 000,00 $</div>
                    <button className="tx-receipt">
                      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
      
            {/* Invoices */}
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Factures (PDF)</h2>
                <span className="panel-action">Toutes les factures →</span>
              </div>
              <div>
                <div className="invoice-row">
                  <div className="invoice-icon">📄</div>
                  <div>
                    <div className="invoice-num">INV-48201</div>
                    <div className="invoice-date">15 mai 2026</div>
                  </div>
                  <div className="invoice-meta">Commande #SIN-48201</div>
                  <div className="invoice-amount">116,24 $</div>
                  <button className="invoice-pdf">↓ PDF</button>
                </div>
                <div className="invoice-row">
                  <div className="invoice-icon">📄</div>
                  <div>
                    <div className="invoice-num">INV-48189</div>
                    <div className="invoice-date">14 mai 2026</div>
                  </div>
                  <div className="invoice-meta">Commande #SIN-48189</div>
                  <div className="invoice-amount">98,40 $</div>
                  <button className="invoice-pdf">↓ PDF</button>
                </div>
                <div className="invoice-row">
                  <div className="invoice-icon">📄</div>
                  <div>
                    <div className="invoice-num">INV-48102</div>
                    <div className="invoice-date">10 mai 2026</div>
                  </div>
                  <div className="invoice-meta">Commande #SIN-48102</div>
                  <div className="invoice-amount">187,60 $</div>
                  <button className="invoice-pdf">↓ PDF</button>
                </div>
                <div className="invoice-row">
                  <div className="invoice-icon">📄</div>
                  <div>
                    <div className="invoice-num">INV-47921</div>
                    <div className="invoice-date">2 mai 2026</div>
                  </div>
                  <div className="invoice-meta">Commande #SIN-47921</div>
                  <div className="invoice-amount">142,80 $</div>
                  <button className="invoice-pdf">↓ PDF</button>
                </div>
              </div>
              <div className="pay-export">
                <button className="export-btn">⇩ Exporter CSV (12 mois)</button>
                <button className="export-btn">⇩ Rapport annuel 2026 (PDF)</button>
                <button className="export-btn">📧 Recevoir par courriel</button>
              </div>
            </div>
          </main>
        </div>
    </>
  );
}
