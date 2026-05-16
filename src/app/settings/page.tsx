/**
 * Auto-migrated from Open Design HTML artifact `account-settings.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Paramètres — Imprime" };

export default function SettingsPage() {
  return (
    <>
      <div className="acct-shell">
          <aside className="acct-nav">
            <div className="acct-nav-brand">Imprime.</div>
            <div className="acct-nav-section">Compte</div>
            <ul className="acct-nav-list">
              <li><a href="/orders" className="acct-nav-link">Mes commandes <span className="count">12</span></a></li>
              <li><a href="/drafts" className="acct-nav-link">Brouillons <span className="count">3</span></a></li>
              <li><a href="/addresses" className="acct-nav-link">Adresses <span className="count">4</span></a></li>
              <li><a href="/wallet" className="acct-nav-link">Portefeuille</a></li>
              <li><a href="/payments" className="acct-nav-link">Paiements</a></li>
              <li><a href="/referrals" className="acct-nav-link">Parrainage</a></li>
              <li><a href="/settings" className="acct-nav-link active">Paramètres</a></li>
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
      
          <main className="settings-layout">
            {/* Tabs sidebar */}
            <aside className="settings-tabs">
              <a href="#profile" className="settings-tab active"><span className="settings-tab-icon">👤</span> Profil</a>
              <a href="#security" className="settings-tab"><span className="settings-tab-icon">🔒</span> Sécurité</a>
              <a href="#notifications" className="settings-tab"><span className="settings-tab-icon">🔔</span> Notifications</a>
              <a href="#preferences" className="settings-tab"><span className="settings-tab-icon">⚙</span> Préférences</a>
              <a href="#billing" className="settings-tab"><span className="settings-tab-icon">📄</span> Facturation</a>
              <a href="#api" className="settings-tab"><span className="settings-tab-icon">⚡</span> API &amp; webhooks</a>
              <a href="#danger" className="settings-tab" style={{ color: "var(--danger)", marginTop: "16px" } as React.CSSProperties}><span className="settings-tab-icon">⚠</span> Zone à risque</a>
            </aside>
      
            {/* Content */}
            <div className="settings-content">
              <div>
                <h1 className="page-title">Paramètres</h1>
                <p className="page-subtitle">Gère ton compte, sécurité, préférences et notifications.</p>
              </div>
      
              {/* Profile */}
              <div className="profile-card" id="profile">
                <div className="profile-avatar">PT</div>
                <div className="profile-info">
                  <h2>Patrick Thauvette</h2>
                  <p>patrick@democratik.org · Membre depuis mars 2026</p>
                  <span className="profile-tier">Tier Pro</span>
                </div>
                <div className="profile-since">
                  <strong>12 commandes</strong>
                  2 042,80 $ dépensés
                </div>
              </div>
      
              {/* Personal info */}
              <div className="panel">
                <h2 className="panel-title">Informations personnelles</h2>
                <p className="panel-desc">Utilisées pour les factures et les emails de confirmation.</p>
                <div className="form-grid">
                  <div className="form-row-2">
                    <div className="field"><label>Prénom</label><input type="text" value="Patrick" /></div>
                    <div className="field"><label>Nom</label><input type="text" value="Thauvette" /></div>
                  </div>
                  <div>
                    <div className="field"><label>Email</label><input type="email" value="patrick@democratik.org" /></div>
                    <div className="field-helper"><strong>✓ Vérifié</strong> · changement nécessite confirmation par lien magique</div>
                  </div>
                  <div className="form-row-2">
                    <div className="field"><label>Téléphone</label><input type="tel" value="(514) 555-0123" /></div>
                    <div className="field"><label>Entreprise</label><input type="text" value="Démocratik" /></div>
                  </div>
                </div>
                <div className="save-bar">
                  <span className="save-bar-status">Sauvegardé · il y a 12s</span>
                  <div className="save-actions">
                    <button className="save-cancel">Annuler</button>
                    <button className="save-submit">Enregistrer</button>
                  </div>
                </div>
              </div>
      
              {/* Security */}
              <div className="panel" id="security">
                <h2 className="panel-title">Sécurité</h2>
                <p className="panel-desc">Mot de passe, authentification à deux facteurs, sessions actives.</p>
      
                <div className="form-grid" style={{ marginBottom: "24px" } as React.CSSProperties}>
                  <div className="form-row-2">
                    <div className="field"><label>Mot de passe actuel</label><input type="password" value="••••••••" /></div>
                    <div className="field"><label>Nouveau mot de passe</label><input type="password" placeholder="Min. 12 caractères" /></div>
                  </div>
                </div>
      
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "18px", letterSpacing: "-0.01em", margin: "32px 0 12px", fontWeight: "400" } as React.CSSProperties}>Authentification à deux facteurs</h3>
                <div className="toggle-list">
                  <div className="toggle-row">
                    <div className="toggle-info">
                      <strong>Application authenticator (TOTP)</strong>
                      <span>Google Authenticator, 1Password, Authy</span>
                    </div>
                    <div className="toggle-switch"></div>
                  </div>
                  <div className="toggle-row">
                    <div className="toggle-info">
                      <strong>Clé physique (FIDO2 / Yubikey)</strong>
                      <span>Le plus sécurisé · recommandé pour Pro et plus</span>
                    </div>
                    <div className="toggle-switch off"></div>
                  </div>
                  <div className="toggle-row">
                    <div className="toggle-info">
                      <strong>SMS de secours</strong>
                      <span>Code à 6 chiffres au (514) 555-0123 · moins sécurisé que TOTP</span>
                    </div>
                    <div className="toggle-switch off"></div>
                  </div>
                </div>
      
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "18px", letterSpacing: "-0.01em", margin: "32px 0 12px", fontWeight: "400" } as React.CSSProperties}>Sessions actives</h3>
                <div className="session-row">
                  <div className="session-icon">💻</div>
                  <div className="session-info">
                    <strong>MacBook Pro · Chrome 137</strong>
                    <span>Montréal, QC · IP 38.133.46.125</span>
                  </div>
                  <span className="session-time">Maintenant</span>
                  <span className="session-current">★ Cette session</span>
                </div>
                <div className="session-row">
                  <div className="session-icon">📱</div>
                  <div className="session-info">
                    <strong>iPhone 15 Pro · Safari</strong>
                    <span>Montréal, QC · IP 99.225.118.42</span>
                  </div>
                  <span className="session-time">il y a 2 jours</span>
                  <span className="session-revoke">Révoquer</span>
                </div>
                <div className="session-row">
                  <div className="session-icon">💻</div>
                  <div className="session-info">
                    <strong>iMac (bureau) · Safari 18</strong>
                    <span>Montréal, QC · IP 70.83.221.7</span>
                  </div>
                  <span className="session-time">il y a 5 jours</span>
                  <span className="session-revoke">Révoquer</span>
                </div>
              </div>
      
              {/* Notifications */}
              <div className="panel" id="notifications">
                <h2 className="panel-title">Notifications</h2>
                <p className="panel-desc">Choisis comment et quand on te contacte.</p>
      
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "18px", letterSpacing: "-0.01em", margin: "8px 0 12px", fontWeight: "400" } as React.CSSProperties}>Email</h3>
                <div className="toggle-list" style={{ marginBottom: "24px" } as React.CSSProperties}>
                  <div className="toggle-row">
                    <div className="toggle-info"><strong>Confirmations de commande</strong><span>À chaque nouvelle commande passée</span></div>
                    <div className="toggle-switch"></div>
                  </div>
                  <div className="toggle-row">
                    <div className="toggle-info"><strong>Mises à jour de production</strong><span>Quand le statut d'une commande change</span></div>
                    <div className="toggle-switch"></div>
                  </div>
                  <div className="toggle-row">
                    <div className="toggle-info"><strong>Tracking d'expédition</strong><span>Numéro de tracking + livraison</span></div>
                    <div className="toggle-switch"></div>
                  </div>
                  <div className="toggle-row">
                    <div className="toggle-info"><strong>Solde wallet bas</strong><span>Si solde &lt; 100 $</span></div>
                    <div className="toggle-switch"></div>
                  </div>
                  <div className="toggle-row">
                    <div className="toggle-info"><strong>Infolettre mensuelle</strong><span>Nouveaux produits, conseils print, promotions</span></div>
                    <div className="toggle-switch off"></div>
                  </div>
                  <div className="toggle-row">
                    <div className="toggle-info"><strong>Communication marketing</strong><span>Webinars, événements, partenariats</span></div>
                    <div className="toggle-switch off"></div>
                  </div>
                </div>
      
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "18px", letterSpacing: "-0.01em", margin: "0 0 12px", fontWeight: "400" } as React.CSSProperties}>SMS &amp; push</h3>
                <div className="toggle-list">
                  <div className="toggle-row">
                    <div className="toggle-info"><strong>SMS critiques uniquement</strong><span>Échec de paiement, livraison aujourd'hui</span></div>
                    <div className="toggle-switch"></div>
                  </div>
                  <div className="toggle-row">
                    <div className="toggle-info"><strong>Notifications push</strong><span>Application mobile (bientôt disponible)</span></div>
                    <div className="toggle-switch off"></div>
                  </div>
                </div>
              </div>
      
              {/* Preferences */}
              <div className="panel" id="preferences">
                <h2 className="panel-title">Préférences</h2>
                <p className="panel-desc">Langue, devise, format de date.</p>
      
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "16px", letterSpacing: "-0.01em", margin: "0 0 12px", fontWeight: "400" } as React.CSSProperties}>Langue</h3>
                <div className="locale-picker" style={{ marginBottom: "24px" } as React.CSSProperties}>
                  <div className="locale-card active">
                    <div className="locale-flag">🇨🇦</div>
                    <div className="locale-info">
                      <strong>Français (Canada)</strong>
                      <span>fr-CA</span>
                    </div>
                  </div>
                  <div className="locale-card">
                    <div className="locale-flag">🇨🇦</div>
                    <div className="locale-info">
                      <strong>English (Canada)</strong>
                      <span>en-CA</span>
                    </div>
                  </div>
                </div>
      
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "16px", letterSpacing: "-0.01em", margin: "0 0 12px", fontWeight: "400" } as React.CSSProperties}>Thème</h3>
                <div className="locale-picker" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: "24px" } as React.CSSProperties}>
                  <div className="locale-card active"><div className="locale-flag">☀</div><div className="locale-info"><strong>Clair</strong><span>Toujours</span></div></div>
                  <div className="locale-card"><div className="locale-flag">🌙</div><div className="locale-info"><strong>Sombre</strong><span>Toujours</span></div></div>
                  <div className="locale-card"><div className="locale-flag">⚙</div><div className="locale-info"><strong>Système</strong><span>Auto</span></div></div>
                </div>
      
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "16px", letterSpacing: "-0.01em", margin: "0 0 12px", fontWeight: "400" } as React.CSSProperties}>Format</h3>
                <div className="form-row-2">
                  <div className="field">
                    <label>Devise</label>
                    <select><option>CAD ($) — Dollar canadien</option></select>
                  </div>
                  <div className="field">
                    <label>Format de date</label>
                    <select><option>DD MMM YYYY (15 mai 2026)</option><option>YYYY-MM-DD (2026-05-15)</option></select>
                  </div>
                </div>
              </div>
      
              {/* Danger zone */}
              <div className="danger-zone" id="danger">
                <h3>Zone à risque</h3>
                <p>Actions irréversibles. Procède avec prudence.</p>
                <div className="danger-row">
                  <div>
                    <strong>Exporter mes données</strong>
                    <span>Télécharge un ZIP complet de tes commandes, fichiers et historique de transactions.</span>
                  </div>
                  <button className="danger-btn" style={{ background: "var(--bg-canvas)", color: "var(--text-secondary)", borderColor: "var(--border-default)" } as React.CSSProperties}>⇩ Exporter</button>
                </div>
                <div className="danger-row">
                  <div>
                    <strong>Suspendre mon compte</strong>
                    <span>Désactive temporairement (sans supprimer). Réactivation à tout moment.</span>
                  </div>
                  <button className="danger-btn">Suspendre</button>
                </div>
                <div className="danger-row">
                  <div>
                    <strong>Supprimer mon compte définitivement</strong>
                    <span>Toutes tes données sont effacées sous 30 jours. Wallet remboursé sur la dernière carte utilisée.</span>
                  </div>
                  <button className="danger-btn">Supprimer</button>
                </div>
              </div>
            </div>
          </main>
        </div>
    </>
  );
}
