/**
 * Auto-migrated from Open Design HTML artifact `admin-user-detail.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Admin — Détail utilisateur" };

export default function AdminUserDetail() {
  return (
    <>
      <div className="adm-shell">
      
          {/* ─── SIDEBAR ───────────────────────────────────────────────── */}
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
              <li><a href="admin-users.html" className="adm-nav-link active">
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
      
            <nav className="ud-breadcrumb">
              <a href="admin-users.html">← Utilisateurs</a>
              <span style={{ color: "var(--border-strong)" } as React.CSSProperties}>/</span>
              <span className="ud-breadcrumb-current">Sophie Beauchamp</span>
            </nav>
      
            <header className="ud-header">
              <div className="ud-avatar-big">SB</div>
              <div>
                <h1 className="ud-name">Sophie Beauchamp</h1>
                <div className="ud-name-meta">
                  <strong>sophie@boreal.studio</strong> · membre depuis le 14 fév 2026 · ID <span style={{ color: "var(--text-muted)" } as React.CSSProperties}>usr_QnPx9KkLfg2Cv4</span>
                </div>
                <div className="ud-header-tags">
                  <span className="ud-tag verified">✓ Email vérifié</span>
                  <span className="ud-tag vip">High-value · LTV $1 847</span>
                </div>
              </div>
            </header>
      
            {/* ─── Quick stats ─────────────────────────────────────────── */}
            <section className="ud-quickstats">
              <div className="ud-qs">
                <div className="ud-qs-label">Lifetime value</div>
                <div className="ud-qs-value accent">1 847<span className="unit">$ CAD</span></div>
                <div className="ud-qs-meta">net après refunds (0 $)</div>
              </div>
              <div className="ud-qs">
                <div className="ud-qs-label">Commandes</div>
                <div className="ud-qs-value">7<span className="unit">complétées</span></div>
                <div className="ud-qs-meta">6 expédiées · 1 en transit</div>
              </div>
              <div className="ud-qs">
                <div className="ud-qs-label">Panier moyen (AOV)</div>
                <div className="ud-qs-value">264<span className="unit">$ CAD</span></div>
                <div className="ud-qs-meta">médiane 187 $</div>
              </div>
              <div className="ud-qs">
                <div className="ud-qs-label">Dernière commande</div>
                <div className="ud-qs-value">il y a 6h<span className="unit"></span></div>
                <div className="ud-qs-meta">16 mai · 14:32 · #SIN-48312</div>
              </div>
            </section>
      
            {/* ─── 2-col grid ──────────────────────────────────────────── */}
            <div className="ud-grid">
      
              {/* ─── LEFT ──────────────────────────────────────────────── */}
              <div className="ud-col-left">
      
                {/* Orders history */}
                <div className="ud-panel">
                  <div className="ud-panel-head">
                    <h2 className="ud-panel-title">Historique de commandes <span className="ud-panel-title-meta">7 commandes</span></h2>
                    <a href="#" className="ud-panel-link">↓ Exporter</a>
                  </div>
                  <table className="ud-orders-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Date</th>
                        <th>Produit</th>
                        <th style={{ textAlign: "right" } as React.CSSProperties}>Qty</th>
                        <th style={{ textAlign: "right" } as React.CSSProperties}>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><span className="ud-order-id">#SIN-48312</span></td>
                        <td className="ud-order-date">16 mai · 14:32</td>
                        <td>Cartes 16pt UV gloss</td>
                        <td className="ud-order-total" style={{ textAlign: "right" } as React.CSSProperties}>250</td>
                        <td className="ud-order-total">187,42 $</td>
                        <td><span className="ud-order-status production">Production</span></td>
                      </tr>
                      <tr>
                        <td><span className="ud-order-id">#SIN-48298</span></td>
                        <td className="ud-order-date">14 mai · 10:18</td>
                        <td>Cartes 16pt UV gloss</td>
                        <td className="ud-order-total" style={{ textAlign: "right" } as React.CSSProperties}>250</td>
                        <td className="ud-order-total">187,42 $</td>
                        <td><span className="ud-order-status shipped">Expédiée</span></td>
                      </tr>
                      <tr>
                        <td><span className="ud-order-id">#SIN-48241</span></td>
                        <td className="ud-order-date">28 avr · 16:48</td>
                        <td>Cartes postales 14pt</td>
                        <td className="ud-order-total" style={{ textAlign: "right" } as React.CSSProperties}>500</td>
                        <td className="ud-order-total">312,80 $</td>
                        <td><span className="ud-order-status delivered">Livrée</span></td>
                      </tr>
                      <tr>
                        <td><span className="ud-order-id">#SIN-48198</span></td>
                        <td className="ud-order-date">15 avr · 09:12</td>
                        <td>Flyers 100lb satin</td>
                        <td className="ud-order-total" style={{ textAlign: "right" } as React.CSSProperties}>1 000</td>
                        <td className="ud-order-total">428,90 $</td>
                        <td><span className="ud-order-status delivered">Livrée</span></td>
                      </tr>
                      <tr>
                        <td><span className="ud-order-id">#SIN-48142</span></td>
                        <td className="ud-order-date">2 avr · 14:28</td>
                        <td>Cartes 14pt matte</td>
                        <td className="ud-order-total" style={{ textAlign: "right" } as React.CSSProperties}>100</td>
                        <td className="ud-order-total">78,12 $</td>
                        <td><span className="ud-order-status delivered">Livrée</span></td>
                      </tr>
                      <tr>
                        <td><span className="ud-order-id">#SIN-48089</span></td>
                        <td className="ud-order-date">18 mar · 11:48</td>
                        <td>Affiches 18×24</td>
                        <td className="ud-order-total" style={{ textAlign: "right" } as React.CSSProperties}>25</td>
                        <td className="ud-order-total">412,68 $</td>
                        <td><span className="ud-order-status delivered">Livrée</span></td>
                      </tr>
                      <tr>
                        <td><span className="ud-order-id">#SIN-48012</span></td>
                        <td className="ud-order-date">22 fév · 15:02</td>
                        <td>Cartes 16pt UV gloss</td>
                        <td className="ud-order-total" style={{ textAlign: "right" } as React.CSSProperties}>250</td>
                        <td className="ud-order-total">239,90 $</td>
                        <td><span className="ud-order-status delivered">Livrée</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
      
                {/* Activity timeline */}
                <div className="ud-panel">
                  <div className="ud-panel-head">
                    <h2 className="ud-panel-title">Activité <span className="ud-panel-title-meta">auth + commerce</span></h2>
                    <a href="#" className="ud-panel-link">Voir tout</a>
                  </div>
                  <div className="ud-activity">
      
                    <div className="ud-act">
                      <div className="ud-act-dot commerce">$</div>
                      <div className="ud-act-text">Paiement réussi <strong>187,42 $</strong> · <span className="ref">#SIN-48312</span> · Visa •••• 4242</div>
                      <span className="ud-act-time">16 mai · 14:32</span>
                    </div>
                    <div className="ud-act">
                      <div className="ud-act-dot auth">→</div>
                      <div className="ud-act-text">Connexion · macOS · Safari 18 · IP <span className="ref">99.252.84.142</span> Montréal</div>
                      <span className="ud-act-time">16 mai · 14:28</span>
                    </div>
                    <div className="ud-act">
                      <div className="ud-act-dot commerce">✓</div>
                      <div className="ud-act-text">Livraison confirmée <span className="ref">#SIN-48298</span> · UPS Standard · signée S. BEAUCHAMP</div>
                      <span className="ud-act-time">16 mai · 10:24</span>
                    </div>
                    <div className="ud-act">
                      <div className="ud-act-dot profile">✎</div>
                      <div className="ud-act-text">Adresse mise à jour · <strong>Boréal Studio</strong> ajoutée comme adresse par défaut</div>
                      <span className="ud-act-time">15 mai · 09:08</span>
                    </div>
                    <div className="ud-act">
                      <div className="ud-act-dot auth">→</div>
                      <div className="ud-act-text">Connexion · iOS · Safari · IP <span className="ref">99.252.84.142</span> Montréal</div>
                      <span className="ud-act-time">14 mai · 18:42</span>
                    </div>
                    <div className="ud-act">
                      <div className="ud-act-dot commerce">$</div>
                      <div className="ud-act-text">Paiement réussi <strong>187,42 $</strong> · <span className="ref">#SIN-48298</span> · Visa •••• 4242</div>
                      <span className="ud-act-time">14 mai · 10:18</span>
                    </div>
                    <div className="ud-act">
                      <div className="ud-act-dot security">🔒</div>
                      <div className="ud-act-text">Réinitialisation mot de passe demandée et complétée · IP <span className="ref">99.252.84.142</span></div>
                      <span className="ud-act-time">8 mai · 11:32</span>
                    </div>
                    <div className="ud-act">
                      <div className="ud-act-dot profile">✎</div>
                      <div className="ud-act-text">Méthode de paiement ajoutée · Visa <strong>•••• 4242</strong></div>
                      <span className="ud-act-time">28 avr · 16:42</span>
                    </div>
                    <div className="ud-act">
                      <div className="ud-act-dot commerce">$</div>
                      <div className="ud-act-text">Paiement réussi <strong>312,80 $</strong> · <span className="ref">#SIN-48241</span></div>
                      <span className="ud-act-time">28 avr · 16:48</span>
                    </div>
                    <div className="ud-act">
                      <div className="ud-act-dot security">✓</div>
                      <div className="ud-act-text">Email vérifié · <span className="muted">double opt-in confirmé</span></div>
                      <span className="ud-act-time">14 fév · 09:42</span>
                    </div>
                    <div className="ud-act">
                      <div className="ud-act-dot auth">+</div>
                      <div className="ud-act-text"><strong>Compte créé</strong> · inscription email + mot de passe · IP <span className="ref">99.252.84.142</span></div>
                      <span className="ud-act-time">14 fév · 09:38</span>
                    </div>
                  </div>
                </div>
      
                {/* Notes */}
                <div className="ud-panel">
                  <div className="ud-panel-head">
                    <h2 className="ud-panel-title">Notes internes <span className="ud-panel-title-meta">visible admin seulement</span></h2>
                  </div>
                  <div className="ud-notes-body">
                    <textarea className="ud-notes-textarea" placeholder="Écris une note privée sur ce client (visible seulement par l'équipe admin)…"></textarea>
                    <div className="ud-notes-foot">
                      <span className="ud-notes-hint">⌘ + ↵ pour enregistrer</span>
                      <button className="btn btn-primary btn-sm">Enregistrer la note</button>
                    </div>
      
                    <div className="ud-notes-existing">
                      <div className="ud-note">
                        <div className="ud-note-meta">
                          <span>Patrick T.</span>
                          <span>28 avr · 17:02</span>
                        </div>
                        Cliente très réactive sur ses fichiers. Préfère qu'on confirme par courriel quand la production démarre. À noter pour les commandes futures.
                      </div>
                      <div className="ud-note">
                        <div className="ud-note-meta">
                          <span>Patrick T.</span>
                          <span>22 fév · 16:18</span>
                        </div>
                        Boréal Studio = agence design Montréal. Bon potentiel répétition. Lui mentionner le programme volume si elle dépasse 500 $ / commande.
                      </div>
                    </div>
                  </div>
                </div>
      
              </div>
      
              {/* ─── RIGHT ─────────────────────────────────────────────── */}
              <aside className="ud-col-right">
      
                {/* Profile */}
                <div className="ud-card">
                  <div className="ud-card-head">
                    <div className="ud-card-label">Profil</div>
                    <button className="ud-edit-btn">✎ Modifier</button>
                  </div>
                  <div className="ud-field-row">
                    <div className="ud-field-mini">
                      <span className="label">Nom</span>
                      <span className="value">Sophie Beauchamp</span>
                      <span className="edit">✎</span>
                    </div>
                    <div className="ud-field-mini">
                      <span className="label">Email</span>
                      <span className="value">sophie@boreal.studio</span>
                      <span className="edit">✎</span>
                    </div>
                    <div className="ud-field-mini">
                      <span className="label">Téléphone</span>
                      <span className="value">+1 (514) 555-0182</span>
                      <span className="edit">✎</span>
                    </div>
                    <div className="ud-field-mini">
                      <span className="label">Entreprise</span>
                      <span className="value">Boréal Studio</span>
                      <span className="edit">✎</span>
                    </div>
                    <div className="ud-field-mini">
                      <span className="label">Langue</span>
                      <span className="value">fr-CA</span>
                      <span className="edit">✎</span>
                    </div>
                  </div>
                </div>
      
                {/* Address book */}
                <div className="ud-card">
                  <div className="ud-card-head">
                    <div className="ud-card-label">Carnet d'adresses</div>
                    <button className="ud-edit-btn">+ Ajouter</button>
                  </div>
                  <div className="ud-addr">
                    <span className="ud-addr-label default">Livraison</span>
                    <div>
                      <span className="ud-addr-name">Sophie Beauchamp</span>
                      <span className="ud-addr-default-tag">Défaut</span>
                    </div>
                    <div>Boréal Studio</div>
                    <div>4218 rue Saint-Denis, app. 3</div>
                    <div>Montréal, QC  H2J 2L1 · Canada</div>
                  </div>
                  <div className="ud-addr">
                    <span className="ud-addr-label">Facturation</span>
                    <div>
                      <span className="ud-addr-name">Sophie Beauchamp</span>
                    </div>
                    <div>1 chemin du Lac-Brûlé</div>
                    <div>Sainte-Adèle, QC  J8B 1A1 · Canada</div>
                  </div>
                </div>
      
                {/* Payment methods */}
                <div className="ud-card">
                  <div className="ud-card-head">
                    <div className="ud-card-label">Méthodes de paiement · Stripe</div>
                    <button className="ud-edit-btn">↗ Ouvrir</button>
                  </div>
                  <div className="ud-pm">
                    <div className="ud-pm-brand">VISA</div>
                    <div>
                      <div className="ud-pm-card">•••• •••• •••• 4242</div>
                      <div className="ud-pm-exp">EXP 09/28 · DÉFAUT</div>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px", color: "var(--accent-primary)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "600" } as React.CSSProperties}>✓ Principale</span>
                  </div>
                  <div className="ud-pm">
                    <div className="ud-pm-brand mc">MC</div>
                    <div>
                      <div className="ud-pm-card">•••• •••• •••• 5588</div>
                      <div className="ud-pm-exp">EXP 03/27</div>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.02em" } as React.CSSProperties}>Sauvegardée</span>
                  </div>
                </div>
      
                {/* Session info */}
                <div className="ud-card">
                  <div className="ud-card-label" style={{ marginBottom: "6px" } as React.CSSProperties}>Session &amp; sécurité</div>
                  <div className="ud-kv-row">
                    <span className="label">Email</span>
                    <span className="value good">✓ Vérifié</span>
                  </div>
                  <div className="ud-kv-row">
                    <span className="label">2FA</span>
                    <span className="value" style={{ color: "var(--text-muted)" } as React.CSSProperties}>Non activé</span>
                  </div>
                  <div className="ud-kv-row">
                    <span className="label">Dernière connexion</span>
                    <span className="value">16 mai · 14:28</span>
                  </div>
                  <div className="ud-kv-row">
                    <span className="label">Dernière IP</span>
                    <span className="value">99.252.84.142</span>
                  </div>
                  <div className="ud-kv-row">
                    <span className="label">Localisation</span>
                    <span className="value">Montréal, QC</span>
                  </div>
                  <div className="ud-kv-row">
                    <span className="label">Sessions actives</span>
                    <span className="value">2 appareils</span>
                  </div>
                </div>
      
                {/* Risk */}
                <div className="ud-card">
                  <div className="ud-card-head">
                    <div className="ud-card-label">↗ Risk &amp; fraude · Stripe Radar</div>
                  </div>
                  <div className="ud-risk-score">
                    <div className="ud-risk-ring">
                      <svg viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="24" fill="none" stroke="var(--bg-sunken)" stroke-width="5" />
                        <circle cx="28" cy="28" r="24" fill="none" stroke="var(--success)" stroke-width="5" stroke-dasharray="150.8" stroke-dashoffset="132" stroke-linecap="round" />
                      </svg>
                      <span className="ud-risk-ring-val">12</span>
                    </div>
                    <div>
                      <div className="ud-risk-label">Risk score</div>
                      <div className="ud-risk-text ud-risk-good">Profil propre</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)", letterSpacing: "0.02em" } as React.CSSProperties}>12 / 100 · seuil 65</div>
                    </div>
                  </div>
                  <div className="ud-kv-row">
                    <span className="label">Chargebacks</span>
                    <span className="value good">0</span>
                  </div>
                  <div className="ud-kv-row">
                    <span className="label">Disputes</span>
                    <span className="value good">0</span>
                  </div>
                  <div className="ud-kv-row">
                    <span className="label">CVC checks</span>
                    <span className="value good">7/7 OK</span>
                  </div>
                  <div className="ud-kv-row">
                    <span className="label">3DS</span>
                    <span className="value good">Authenticated</span>
                  </div>
                </div>
      
                {/* Danger zone */}
                <div className="ud-danger">
                  <div className="ud-danger-label">Zone dangereuse</div>
                  <button className="ud-danger-btn">
                    <span>Forcer la déconnexion · toutes les sessions</span>
                    <span className="arrow">→</span>
                  </button>
                  <button className="ud-danger-btn">
                    <span>Supprimer le compte · GDPR</span>
                    <span className="arrow">→</span>
                  </button>
                </div>
      
              </aside>
            </div>
      
          </main>
        </div>
    </>
  );
}
