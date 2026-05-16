/**
 * Auto-migrated from Open Design HTML artifact `help.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Centre d'aide — Imprime" };

export default function HelpPage() {
  return (
    <>
      <nav className="mkt-nav">
          <a href="/" className="mkt-brand">Imprime.</a>
          <div className="mkt-nav-links">
            <a href="#" className="mkt-nav-link">Produits</a>
            <a href="/pricing" className="mkt-nav-link">Tarifs</a>
            <a href="/reseller" className="mkt-nav-link">Reseller</a>
            <a href="/help" className="mkt-nav-link active">Aide</a>
            <a href="/sign-in" className="mkt-nav-link">Se connecter</a>
            <a href="/sign-up" className="mkt-nav-cta">S'inscrire →</a>
          </div>
        </nav>
      
        <main>
          {/* HERO */}
          <section className="help-hero">
            <div className="help-eyebrow">Centre d'aide</div>
            <h1>Comment on peut <em>t'aider ?</em></h1>
            <p>Réponses rapides, tutoriels détaillés, ou support humain — selon ce dont tu as besoin.</p>
      
            <div className="help-search">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input type="text" placeholder="Cherche un article, un produit, un problème…" />
              <span className="help-search-kbd">/</span>
            </div>
      
            <div className="help-quick">
              <a href="#" className="help-quick-pill">Comment ajouter du bleed</a>
              <a href="#" className="help-quick-pill">Différence 14pt / 16pt / 18pt</a>
              <a href="#" className="help-quick-pill">Annuler une commande</a>
              <a href="#" className="help-quick-pill">Recharger mon wallet</a>
              <a href="#" className="help-quick-pill">Demander un échantillon</a>
            </div>
          </section>
      
          {/* System status banner */}
          <div className="status-banner">
            <div className="status-banner-text">Tous les systèmes opérationnels — production en jour, livraisons à l'heure</div>
            <a href="#" className="status-banner-link">★ Statut détaillé →</a>
          </div>
      
          {/* CATEGORIES */}
          <section className="help-cats-section">
            <div className="help-cats-grid">
              <a href="#" className="help-cat-card">
                <div className="help-cat-icon">📦</div>
                <h3 className="help-cat-name">Commandes</h3>
                <p className="help-cat-desc">Suivi, modification, annulation, remboursement. Toutes les questions sur le cycle de vie d'une commande.</p>
                <div className="help-cat-count"><span>24 articles</span><strong>Explorer →</strong></div>
              </a>
              <a href="#" className="help-cat-card">
                <div className="help-cat-icon">🎨</div>
                <h3 className="help-cat-name">Fichiers &amp; design</h3>
                <p className="help-cat-desc">Bleed, CMYK, résolution, formats acceptés, templates. Tout ce qui touche à la préparation d'un fichier print.</p>
                <div className="help-cat-count"><span>18 articles</span><strong>Explorer →</strong></div>
              </a>
              <a href="#" className="help-cat-card">
                <div className="help-cat-icon">📄</div>
                <h3 className="help-cat-name">Produits &amp; finitions</h3>
                <p className="help-cat-desc">Papiers, formats, coatings spéciaux (UV, foil, soft touch), différences entre options.</p>
                <div className="help-cat-count"><span>32 articles</span><strong>Explorer →</strong></div>
              </a>
              <a href="#" className="help-cat-card">
                <div className="help-cat-icon">🚚</div>
                <h3 className="help-cat-name">Livraison</h3>
                <p className="help-cat-desc">Délais, carriers, tracking, blind shipping, zones desservies, problèmes de livraison.</p>
                <div className="help-cat-count"><span>15 articles</span><strong>Explorer →</strong></div>
              </a>
              <a href="#" className="help-cat-card">
                <div className="help-cat-icon">💳</div>
                <h3 className="help-cat-name">Paiements &amp; wallet</h3>
                <p className="help-cat-desc">Méthodes de paiement, recharges wallet, factures, taxes, remboursements Stripe.</p>
                <div className="help-cat-count"><span>12 articles</span><strong>Explorer →</strong></div>
              </a>
              <a href="#" className="help-cat-card">
                <div className="help-cat-icon">⚡</div>
                <h3 className="help-cat-name">Compte &amp; sécurité</h3>
                <p className="help-cat-desc">Login, mot de passe, 2FA, adresses sauvegardées, données personnelles, suppression de compte.</p>
                <div className="help-cat-count"><span>14 articles</span><strong>Explorer →</strong></div>
              </a>
              <a href="/reseller" className="help-cat-card">
                <div className="help-cat-icon">🏢</div>
                <h3 className="help-cat-name">Programme reseller</h3>
                <p className="help-cat-desc">Tiers, remises, blind shipping, API, marque blanche, multi-utilisateurs.</p>
                <div className="help-cat-count"><span>21 articles</span><strong>Explorer →</strong></div>
              </a>
              <a href="#" className="help-cat-card">
                <div className="help-cat-icon">🔌</div>
                <h3 className="help-cat-name">API &amp; intégrations</h3>
                <p className="help-cat-desc">Documentation OpenAPI, webhooks, plugins Shopify / WooCommerce, exemples de code.</p>
                <div className="help-cat-count"><span>9 articles</span><strong>Explorer →</strong></div>
              </a>
            </div>
          </section>
      
          {/* POPULAR ARTICLES */}
          <section className="popular-section" style={{ maxWidth: "none", padding: "64px 0" } as React.CSSProperties}>
            <div className="popular-section-inner">
              <div className="section-header">
                <h2>Articles populaires <em>cette semaine</em></h2>
                <span>Mis à jour il y a 2h</span>
              </div>
              <div className="articles-grid">
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">Fichiers &amp; design</span>
                    <span className="article-title">Comment ajouter du bleed à mon design (Illustrator, Photoshop, InDesign)</span>
                    <span className="article-meta">Lecture 4 min · 12k+ vues</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">Produits</span>
                    <span className="article-title">14pt vs 16pt vs 18pt — quel grammage choisir pour mes cartes ?</span>
                    <span className="article-meta">Lecture 6 min · 8 700 vues</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">Commandes</span>
                    <span className="article-title">Puis-je annuler ma commande après le paiement ?</span>
                    <span className="article-meta">Lecture 2 min · 6 200 vues</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">Fichiers &amp; design</span>
                    <span className="article-title">CMYK vs RGB — pourquoi mon rouge devient mat à l'impression</span>
                    <span className="article-meta">Lecture 5 min · 5 800 vues</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">Livraison</span>
                    <span className="article-title">Calcul des taxes — TPS, TVQ, HST selon ma province</span>
                    <span className="article-meta">Lecture 3 min · 4 100 vues</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">Paiements</span>
                    <span className="article-title">Pourquoi pré-charger mon wallet ? (bonus jusqu'à 8 %)</span>
                    <span className="article-meta">Lecture 3 min · 3 900 vues</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
              </div>
            </div>
          </section>
      
          {/* POPULAR + CONTACT */}
          <div className="help-bottom">
            {/* Recent updates (left) */}
            <div>
              <div className="section-header">
                <h2>Mises à jour <em>récentes</em></h2>
                <span>3 nouveaux articles cette semaine</span>
              </div>
              <div style={{ display: "grid", gap: "12px" } as React.CSSProperties}>
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">★ Nouveau · 13 mai</span>
                    <span className="article-title">Foil holographique disponible — 7 motifs au choix</span>
                    <span className="article-meta">Annonce produit · lecture 2 min</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">★ Nouveau · 10 mai</span>
                    <span className="article-title">Webhooks pour suivi de commande en temps réel (API v2)</span>
                    <span className="article-meta">Mise à jour API · lecture 8 min</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">Mis à jour · 8 mai</span>
                    <span className="article-title">Nouveau workflow d'approbation pour resellers Studio</span>
                    <span className="article-meta">Compte · lecture 4 min</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
              </div>
      
              <div className="section-header" style={{ marginTop: "40px" } as React.CSSProperties}>
                <h2>Vidéos &amp; <em>tutoriels</em></h2>
                <span>YouTube</span>
              </div>
              <div style={{ display: "grid", gap: "12px" } as React.CSSProperties}>
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">▶ Vidéo · 8 min</span>
                    <span className="article-title">Premier devis dans Imprime — de A à Z</span>
                    <span className="article-meta">Tutoriel débutant</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
                <a href="#" className="article-card">
                  <div className="article-info">
                    <span className="article-cat">▶ Vidéo · 12 min</span>
                    <span className="article-title">Préparer un fichier impeccable pour le print</span>
                    <span className="article-meta">Tutoriel intermédiaire</span>
                  </div>
                  <div className="article-arrow">→</div>
                </a>
              </div>
            </div>
      
            {/* Contact (right) */}
            <div className="contact-card">
              <h3>Toujours <em>besoin d'aide ?</em></h3>
              <p>Notre équipe répond rapidement — en français et en anglais, lun-ven 9h à 18h ET.</p>
      
              <div className="contact-channels">
                <a href="#" className="contact-channel">
                  <div className="contact-icon">💬</div>
                  <div className="contact-info">
                    <span className="contact-name">Chat en direct</span>
                    <span className="contact-meta">Réponse en ~3 min</span>
                  </div>
                  <span className="contact-status online">En ligne</span>
                </a>
                <a href="mailto:hello@imprime.co" className="contact-channel">
                  <div className="contact-icon">📧</div>
                  <div className="contact-info">
                    <span className="contact-name">hello@imprime.co</span>
                    <span className="contact-meta">Réponse sous 4h</span>
                  </div>
                </a>
                <a href="tel:+15145550100" className="contact-channel">
                  <div className="contact-icon">📞</div>
                  <div className="contact-info">
                    <span className="contact-name">+1 514 555 0100</span>
                    <span className="contact-meta">Lun-ven 9h-18h ET</span>
                  </div>
                </a>
              </div>
      
              <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid var(--border-subtle)" } as React.CSSProperties}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600", margin: "0 0 16px" } as React.CSSProperties}>★ Envoie-nous un message</p>
                <div className="contact-form">
                  <div className="contact-field"><input type="text" placeholder="Sujet" /></div>
                  <div className="contact-field"><textarea rows={4} placeholder="Décris ton problème ou ta question…"></textarea></div>
                  <button className="contact-submit">Envoyer →</button>
                </div>
              </div>
            </div>
          </div>
        </main>
    </>
  );
}
