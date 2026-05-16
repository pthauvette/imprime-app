/**
 * Auto-migrated from Open Design HTML artifact `referrals.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Parrainage — Plio" };

export default function ReferralsPage() {
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
              <li><a href="/payments" className="acct-nav-link">Paiements</a></li>
              <li><a href="/referrals" className="acct-nav-link active">Parrainage <span className="count">3</span></a></li>
              <li><a href="/settings" className="acct-nav-link">Paramètres</a></li>
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
            </ul>
          </aside>
      
          <main className="acct-main">
            <div className="page-eyebrow">Programme parrainage</div>
            <h1 className="page-title">Donne <em>25 $,</em> reçois <em>25 $.</em></h1>
            <p className="page-lede">Pour chaque ami parrainé qui passe sa première commande, vous recevez chacun 25 $ de crédit imprimable.</p>
      
            {/* Hero with code */}
            <div className="ref-hero">
              <div className="ref-hero-content">
                <div>
                  <div className="ref-formula">
                    <span className="ref-amount">25<span className="unit"> $</span></span>
                    <span className="ref-arrow">+</span>
                    <span className="ref-amount">25<span className="unit"> $</span></span>
                  </div>
                  <p className="ref-explainer"><strong>Toi</strong> reçois 25 $ quand ton ami passe sa première commande de 50 $+. <strong>Ton ami</strong> reçoit 25 $ à utiliser sur sa première commande. <em>Pas de limite de parrainages.</em></p>
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-muted)", letterSpacing: "0.04em" } as React.CSSProperties}>
                    <span>★ Crédité automatiquement</span>
                    <span>★ Cumulable</span>
                    <span>★ Valide 12 mois</span>
                  </div>
                </div>
      
                <div className="ref-code-box">
                  <div className="ref-code-label">★ Ton code unique</div>
                  <div className="ref-code-input">
                    <div className="ref-code-value">PATRICK-25</div>
                    <button className="ref-copy">📋 Copier</button>
                  </div>
                  <div className="ref-share">
                    <button className="ref-share-btn">📧<span className="lbl">Email</span></button>
                    <button className="ref-share-btn">𝕏<span className="lbl">Twitter</span></button>
                    <button className="ref-share-btn">💼<span className="lbl">LinkedIn</span></button>
                    <button className="ref-share-btn">📱<span className="lbl">SMS</span></button>
                  </div>
                  <div className="ref-link-box">
                    <code>plio.ca/?r=PATRICK-25</code>
                    <button>Copier lien</button>
                  </div>
                </div>
              </div>
            </div>
      
            {/* Stats */}
            <div className="ref-stats">
              <div className="stat-card">
                <div className="stat-label">Crédit gagné</div>
                <div className="stat-value">75 $</div>
                <div className="stat-trend up">3 amis ont commandé</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Amis inscrits</div>
                <div className="stat-value">7</div>
                <div className="stat-trend">via ton code</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">En attente</div>
                <div className="stat-value">100 $</div>
                <div className="stat-trend">4 inscrits sans commande</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Crédit utilisé</div>
                <div className="stat-value">50 $</div>
                <div className="stat-trend">sur 25 $ restants</div>
              </div>
            </div>
      
            {/* Tier progression (gamification) */}
            <div className="tier-card">
              <div className="tier-header">
                <h2 className="tier-title">Plus tu parraines, plus tu gagnes</h2>
                <span className="tier-current">★ Niveau Argent</span>
              </div>
              <div className="tier-bar">
                <div className="tier-bar-fill"></div>
              </div>
              <div className="tier-marks">
                <div className="tier-mark"><strong>Bronze</strong>1 ami</div>
                <div className="tier-mark active"><strong>Argent</strong>3 amis · 25 $/ami</div>
                <div className="tier-mark locked"><strong>Or</strong>10 amis · 35 $/ami</div>
                <div className="tier-mark locked"><strong>Diamant</strong>25 amis · 50 $/ami</div>
              </div>
              <div style={{ marginTop: "16px", padding: "14px 16px", background: "var(--accent-soft)", borderRadius: "var(--r-md)", fontSize: "13px", color: "var(--text-primary)" } as React.CSSProperties}>
                ★ Plus que <strong style={{ color: "var(--accent-primary)" } as React.CSSProperties}>7 amis</strong> pour atteindre le niveau <strong>Or</strong> et passer à <strong style={{ fontFamily: "var(--font-mono)", color: "var(--accent-primary)" } as React.CSSProperties}>35 $/ami</strong>.
              </div>
            </div>
      
            {/* Two col */}
            <div className="two-col">
              {/* Friends list */}
              <div className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">Amis parrainés</h2>
                  <span className="panel-meta">7 inscrits · 3 acheteurs</span>
                </div>
                <div className="friend-row">
                  <div className="friend-avatar">SB</div>
                  <div className="friend-info">
                    <strong>Sophie Beauchamp</strong>
                    <span>sophie@vingtdeux.studio · 28 mar 2026</span>
                  </div>
                  <span className="friend-status ordered">A commandé</span>
                  <span className="friend-credit">+25 $</span>
                </div>
                <div className="friend-row">
                  <div className="friend-avatar" style={{ background: "linear-gradient(135deg, #f5f1e8, #d4af37)" } as React.CSSProperties}>MR</div>
                  <div className="friend-info">
                    <strong>Maxime Roy</strong>
                    <span>maxime@boreal.agency · 15 fév 2026</span>
                  </div>
                  <span className="friend-status ordered">A commandé</span>
                  <span className="friend-credit">+25 $</span>
                </div>
                <div className="friend-row">
                  <div className="friend-avatar" style={{ background: "linear-gradient(135deg, #c8d2cc, var(--accent-primary))" } as React.CSSProperties}>ÉT</div>
                  <div className="friend-info">
                    <strong>Élise Tremblay</strong>
                    <span>elise@loupcie.ca · 8 fév 2026</span>
                  </div>
                  <span className="friend-status ordered">A commandé</span>
                  <span className="friend-credit">+25 $</span>
                </div>
                <div className="friend-row">
                  <div className="friend-avatar" style={{ background: "linear-gradient(135deg, #f5f1e8, #B45F1F)" } as React.CSSProperties}>JC</div>
                  <div className="friend-info">
                    <strong>Julie Charron</strong>
                    <span>julie@maisonverte.ca · 22 avr 2026</span>
                  </div>
                  <span className="friend-status signed">Inscrite</span>
                  <span className="friend-credit" style={{ color: "var(--text-muted)" } as React.CSSProperties}>— en attente</span>
                </div>
                <div className="friend-row">
                  <div className="friend-avatar" style={{ background: "linear-gradient(135deg, #B5D3C0, var(--accent-pressed))" } as React.CSSProperties}>MA</div>
                  <div className="friend-info">
                    <strong>Marc Allard</strong>
                    <span>marc@allardstudio.com · 5 mai 2026</span>
                  </div>
                  <span className="friend-status signed">Inscrit</span>
                  <span className="friend-credit" style={{ color: "var(--text-muted)" } as React.CSSProperties}>— en attente</span>
                </div>
                <div className="friend-row">
                  <div className="friend-avatar">AB</div>
                  <div className="friend-info">
                    <strong>Antoine Bélanger</strong>
                    <span>antoine@bcreative.ca · 12 mai 2026</span>
                  </div>
                  <span className="friend-status pending">Lien cliqué</span>
                  <span className="friend-credit" style={{ color: "var(--text-muted)" } as React.CSSProperties}>—</span>
                </div>
                <div className="friend-row">
                  <div className="friend-avatar">+2</div>
                  <div className="friend-info" style={{ color: "var(--text-muted)" } as React.CSSProperties}>
                    <strong style={{ color: "var(--text-secondary)" } as React.CSSProperties}>2 autres amis</strong>
                    <span>code envoyé · pas encore inscrits</span>
                  </div>
                  <span className="friend-status pending">Envoyé</span>
                  <span className="friend-credit" style={{ color: "var(--text-muted)" } as React.CSSProperties}>—</span>
                </div>
              </div>
      
              {/* How it works */}
              <div className="panel">
                <div className="panel-header">
                  <h2 className="panel-title">Comment ça marche</h2>
                </div>
                <div className="hiw-list">
                  <div className="hiw-step">
                    <div className="hiw-num">1</div>
                    <div className="hiw-text">
                      <strong>Partage ton code unique</strong>
                      <span>Email, SMS, réseaux sociaux ou ton lien personnalisé.</span>
                    </div>
                  </div>
                  <div className="hiw-step">
                    <div className="hiw-num">2</div>
                    <div className="hiw-text">
                      <strong>Ton ami s'inscrit avec ton code</strong>
                      <span>Il reçoit instantanément 25 $ de crédit à utiliser.</span>
                    </div>
                  </div>
                  <div className="hiw-step">
                    <div className="hiw-num">3</div>
                    <div className="hiw-text">
                      <strong>Il passe sa première commande de 50 $+</strong>
                      <span>Le crédit s'applique sur cette commande ou les suivantes.</span>
                    </div>
                  </div>
                  <div className="hiw-step">
                    <div className="hiw-num">4</div>
                    <div className="hiw-text">
                      <strong>Tu reçois 25 $ automatiquement</strong>
                      <span>Crédité dans ton wallet, utilisable sur n'importe quelle commande.</span>
                    </div>
                  </div>
                </div>
      
                <div className="terms-note">
                  ★ <strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>Conditions :</strong> commande min. 50 $, valable première commande uniquement, crédit valable 12 mois, non échangeable contre espèces. <a href="#" style={{ color: "var(--accent-primary)", textDecoration: "underline" } as React.CSSProperties}>Voir les conditions complètes →</a>
                </div>
              </div>
            </div>
          </main>
        </div>
    </>
  );
}
