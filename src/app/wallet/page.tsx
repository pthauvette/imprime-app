/**
 * Auto-migrated from Open Design HTML artifact `wallet.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Portefeuille — Plio" };

export default function WalletPage() {
  return (
    <>
      <div className="acct-shell">
          <aside className="acct-nav">
            <div className="acct-nav-brand">Plio.</div>
            <div className="acct-nav-section">Compte</div>
            <ul className="acct-nav-list">
              <li><a href="/orders" className="acct-nav-link">Mes commandes <span className="count">12</span></a></li>
              <li><a href="#" className="acct-nav-link">Brouillons <span className="count">3</span></a></li>
              <li><a href="#" className="acct-nav-link">Adresses</a></li>
              <li><a href="/wallet" className="acct-nav-link active">Portefeuille</a></li>
              <li><a href="#" className="acct-nav-link">Paiements</a></li>
              <li><a href="#" className="acct-nav-link">Codes promo</a></li>
            </ul>
            <div className="acct-nav-section">Outils</div>
            <ul className="acct-nav-list">
              <li><a href="/order/start" className="acct-nav-link">+ Nouvelle commande</a></li>
              <li><a href="/samples" className="acct-nav-link">Demander un échantillon</a></li>
              <li><a href="#" className="acct-nav-link">Templates &amp; guides</a></li>
              <li><a href="#" className="acct-nav-link">Devenir reseller</a></li>
            </ul>
            <div className="acct-nav-section">Support</div>
            <ul className="acct-nav-list">
              <li><a href="#" className="acct-nav-link">Aide &amp; FAQ</a></li>
              <li><a href="#" className="acct-nav-link">Contact</a></li>
            </ul>
          </aside>
      
          <main className="acct-main">
            <h1 className="page-title">Portefeuille</h1>
            <p className="page-subtitle">Précharge ton wallet pour des commandes plus rapides — et débloque jusqu'à <strong style={{ color: "var(--accent-primary)" } as React.CSSProperties}>8 % de bonus</strong>.</p>
      
            {/* Hero balance */}
            <div className="balance-hero">
              <div className="balance-content">
                <div>
                  <div className="balance-label">Solde courant</div>
                  <div className="balance-amount">847<span className="cents">,20 $</span></div>
                  <div className="balance-meta">
                    <span>Couvre <strong>~7 commandes</strong> au prix moyen</span>
                    <span>·</span>
                    <span>Bonus accumulé : <strong>+62,40 $</strong></span>
                  </div>
                </div>
                <div className="recharge-actions">
                  <button className="recharge-quick">+ <span className="amt">100 $</span></button>
                  <button className="recharge-quick">+ <span className="amt">500 $</span> <span className="bonus">+3 % bonus</span></button>
                  <button className="recharge-quick">+ <span className="amt">1 000 $</span> <span className="bonus">+5 % bonus</span></button>
                  <button className="recharge-cta">Recharger maintenant →</button>
                </div>
              </div>
            </div>
      
            {/* Auto-recharge */}
            <div className="auto-recharge">
              <span className="auto-icon">⚡</span>
              <div className="auto-text">
                <strong>Recharge automatique</strong>
                <span>Recharger 500 $ quand le solde passe sous 100 $ — carte par défaut Visa •••• 4242</span>
              </div>
              <div className="auto-switch"></div>
            </div>
      
            {/* Stats */}
            <div className="wallet-stats">
              <div className="stat-card">
                <div className="stat-label">Total préchargé</div>
                <div className="stat-value">2 500 $</div>
                <div className="stat-trend">depuis ton inscription</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Bonus reçu</div>
                <div className="stat-value">125 $</div>
                <div className="stat-trend up">▲ 5 % de retour moyen</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Économie sur Stripe</div>
                <div className="stat-value">62,<span style={{ fontSize: "0.6em", color: "var(--text-secondary)" } as React.CSSProperties}>80 $</span></div>
                <div className="stat-trend">vs paiement par order</div>
              </div>
            </div>
      
            {/* Transactions */}
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Transactions</h2>
                <div className="filter-pills">
                  <div className="filter-pill active">Tout</div>
                  <div className="filter-pill">Recharges</div>
                  <div className="filter-pill">Commandes</div>
                  <div className="filter-pill">Remboursements</div>
                </div>
              </div>
              <div className="tx-list">
                <div className="tx-row">
                  <div className="tx-icon charge">→</div>
                  <div className="tx-info">
                    <div className="tx-title">Commande #SIN-48201 — Cartes 14pt + UV</div>
                    <div className="tx-meta">1 000 unités · paiement automatique</div>
                  </div>
                  <div className="tx-date">15 mai · 15:42</div>
                  <div className="tx-amount out">−116,24 $</div>
                </div>
                <div className="tx-row">
                  <div className="tx-icon charge">→</div>
                  <div className="tx-info">
                    <div className="tx-title">Commande #SIN-48189 — Flyers 8,5 × 11"</div>
                    <div className="tx-meta">500 unités · paiement automatique</div>
                  </div>
                  <div className="tx-date">14 mai · 09:18</div>
                  <div className="tx-amount out">−98,40 $</div>
                </div>
                <div className="tx-row">
                  <div className="tx-icon recharge">+</div>
                  <div className="tx-info">
                    <div className="tx-title">Recharge 1 000 $ + 50 $ bonus</div>
                    <div className="tx-meta">Visa •••• 4242 · ID tx_3PXqwx2eZv...</div>
                  </div>
                  <div className="tx-date">10 mai · 11:30</div>
                  <div className="tx-amount in">+1 050,00 $</div>
                </div>
                <div className="tx-row">
                  <div className="tx-icon charge">→</div>
                  <div className="tx-info">
                    <div className="tx-title">Commande #SIN-48102 — Cartes Foil métallique</div>
                    <div className="tx-meta">250 unités · paiement automatique</div>
                  </div>
                  <div className="tx-date">10 mai · 14:22</div>
                  <div className="tx-amount out">−187,60 $</div>
                </div>
                <div className="tx-row">
                  <div className="tx-icon refund">↺</div>
                  <div className="tx-info">
                    <div className="tx-title">Remboursement — Commande #SIN-47602 annulée</div>
                    <div className="tx-meta">Bannière vinyle · annulée avant production</div>
                  </div>
                  <div className="tx-date">15 avr · 14:08</div>
                  <div className="tx-amount in">+68,00 $</div>
                </div>
                <div className="tx-row">
                  <div className="tx-icon recharge">+</div>
                  <div className="tx-info">
                    <div className="tx-title">Recharge 500 $ + 15 $ bonus</div>
                    <div className="tx-meta">PayPal · ID tx_8K9mLjXr...</div>
                  </div>
                  <div className="tx-date">2 avr · 10:00</div>
                  <div className="tx-amount in">+515,00 $</div>
                </div>
                <div className="tx-row">
                  <div className="tx-icon recharge">🎁</div>
                  <div className="tx-info">
                    <div className="tx-title">Crédit parrainage — Sophie Beauchamp inscrite</div>
                    <div className="tx-meta">Code REF-PATRICK-25 utilisé</div>
                  </div>
                  <div className="tx-date">28 mar · 16:42</div>
                  <div className="tx-amount in">+25,00 $</div>
                </div>
                <div className="tx-row">
                  <div className="tx-icon recharge">+</div>
                  <div className="tx-info">
                    <div className="tx-title">Recharge initiale 1 000 $</div>
                    <div className="tx-meta">Visa •••• 4242 · première recharge</div>
                  </div>
                  <div className="tx-date">1 mar · 09:00</div>
                  <div className="tx-amount in">+1 000,00 $</div>
                </div>
              </div>
            </div>
      
            {/* Bottom */}
            <div className="bottom-grid">
              {/* Tier */}
              <div className="panel">
                <div className="panel-header"><h2 className="panel-title">Mon palier</h2></div>
                <div className="tier-card">
                  <div className="tier-header">
                    <span className="tier-label">★ Palier actuel</span>
                  </div>
                  <h3 className="tier-name">Pro</h3>
                  <div className="tier-progress"><div className="tier-progress-fill"></div></div>
                  <div className="tier-meta">
                    <strong>1 700 $</strong> sur 2 500 $ pour atteindre le palier <strong>Studio</strong>
                  </div>
                  <ul className="tier-list">
                    <li>5 % de bonus sur recharges 500 $+</li>
                    <li>Échantillons gratuits illimités</li>
                    <li>Délai prépresse prioritaire (sous 1h)</li>
                    <li>Support dédié par courriel</li>
                  </ul>
                </div>
                <div style={{ marginTop: "16px", padding: "16px", background: "var(--bg-canvas)", border: "1px dashed var(--border-default)", borderRadius: "var(--r-md)", display: "flex", justifyContent: "space-between", alignItems: "center" } as React.CSSProperties}>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" } as React.CSSProperties}>★ Atteins <strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>Studio</strong> pour <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" } as React.CSSProperties}>8 %</strong> de bonus</span>
                  <button style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--accent-primary)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "700" } as React.CSSProperties}>Voir les paliers →</button>
                </div>
              </div>
      
              {/* Cards on file */}
              <div className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">Cartes</h2>
                  <span className="panel-action">+ Ajouter</span>
                </div>
                <div className="card-on-file">
                  <div className="card-info">
                    <div className="card-brand">VISA</div>
                    <div>
                      <div className="card-num">•••• 4242</div>
                      <div className="card-exp">expire 09/27</div>
                    </div>
                  </div>
                  <span className="card-default">Défaut</span>
                </div>
                <div className="card-on-file">
                  <div className="card-info">
                    <div className="card-brand">MC</div>
                    <div>
                      <div className="card-num">•••• 8801</div>
                      <div className="card-exp">expire 02/28</div>
                    </div>
                  </div>
                  <button style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" } as React.CSSProperties}>Définir</button>
                </div>
                <div style={{ marginTop: "16px", padding: "12px 16px", background: "var(--bg-canvas)", borderRadius: "var(--r-md)", fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "8px" } as React.CSSProperties}>
                  🔒 Cartes stockées de façon sécurisée chez Stripe (PCI Level 1).
                </div>
              </div>
            </div>
          </main>
        </div>
    </>
  );
}
