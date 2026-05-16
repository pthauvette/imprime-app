/**
 * Auto-migrated from Open Design HTML artifact `reseller.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Programme reseller — Plio" };

export default function ResellerPage() {
  return (
    <>
      <nav className="mkt-nav">
          <a href="/" className="mkt-brand">Plio.</a>
          <div className="mkt-nav-links">
            <a href="#" className="mkt-nav-link">Produits</a>
            <a href="/pricing" className="mkt-nav-link">Tarifs</a>
            <a href="/reseller" className="mkt-nav-link active">Reseller</a>
            <a href="/help" className="mkt-nav-link">Aide</a>
            <a href="/sign-in" className="mkt-nav-link">Se connecter</a>
            <a href="/sign-up" className="mkt-nav-cta">S'inscrire →</a>
          </div>
        </nav>
      
        <main>
          {/* HERO */}
          <section className="hero">
            <div>
              <div className="hero-eyebrow">Programme reseller · B2B</div>
              <h1>Print en marque <em>blanche.</em></h1>
              <p className="hero-lede">Pour les agences, freelances et studios qui revendent du print à leurs clients. Jusqu'à <strong style={{ color: "var(--accent-primary)" } as React.CSSProperties}>25 % de remise</strong>, livraison sans marque, API d'intégration.</p>
              <div className="hero-actions">
                <a href="/sign-up" className="hero-cta-primary">Postuler — gratuit</a>
                <a href="#" className="hero-cta-secondary">Parler à un humain →</a>
              </div>
              <div className="hero-trust">
                <span className="hero-trust-item">Validation 24h</span>
                <span className="hero-trust-item">Sans frais d'adhésion</span>
                <span className="hero-trust-item">Blind shipping inclus</span>
              </div>
            </div>
      
            <div className="hero-visual">
              <div className="dash-mock">
                <div className="dash-mock-head">
                  <span className="dash-mock-title">Mes commandes clients</span>
                  <span className="dash-mock-badge">Reseller</span>
                </div>
                <div className="dash-mock-stats">
                  <div className="dash-mock-stat">
                    <div className="dash-mock-stat-lbl">Marge mensuelle</div>
                    <div className="dash-mock-stat-val">847 $</div>
                  </div>
                  <div className="dash-mock-stat">
                    <div className="dash-mock-stat-lbl">Commandes</div>
                    <div className="dash-mock-stat-val">23</div>
                  </div>
                  <div className="dash-mock-stat">
                    <div className="dash-mock-stat-lbl">Clients</div>
                    <div className="dash-mock-stat-val">11</div>
                  </div>
                </div>
                <div className="dash-mock-row">
                  <div className="dash-mock-row-thumb"></div>
                  <div className="dash-mock-row-info"><strong>Studio Vingt-deux</strong><span>Cartes 14pt · 1 000 u.</span></div>
                  <span className="dash-mock-row-amt">+24 $</span>
                </div>
                <div className="dash-mock-row">
                  <div className="dash-mock-row-thumb" style={{ background: "#fafaf7" } as React.CSSProperties}></div>
                  <div className="dash-mock-row-info"><strong>Maison Verte</strong><span>Flyers 8.5×11 · 500 u.</span></div>
                  <span className="dash-mock-row-amt">+18 $</span>
                </div>
                <div className="dash-mock-row">
                  <div className="dash-mock-row-thumb" style={{ background: "linear-gradient(135deg, #d4af37, #f4e5b1)" } as React.CSSProperties}></div>
                  <div className="dash-mock-row-info"><strong>Maxime Roy</strong><span>Cartes Foil · 250 u.</span></div>
                  <span className="dash-mock-row-amt">+47 $</span>
                </div>
              </div>
              <div className="floating-badge fb1">🚚 <strong>Blind shipping</strong> activé</div>
              <div className="floating-badge fb2">★ <strong>15 %</strong> marge moyenne</div>
            </div>
          </section>
      
          {/* BENEFITS */}
          <section>
            <div className="section-eyebrow">Avantages reseller</div>
            <h2 className="section-title">Tout ce qu'il faut pour <em>vendre du print</em> sans imprimer.</h2>
            <p className="section-lede">Tu gères le client. Nous gérons la presse. Personne ne sait qu'on existe.</p>
      
            <div className="benefits-grid">
              <div className="benefit-card">
                <div className="benefit-icon">📦</div>
                <h3 className="benefit-title">Blind shipping</h3>
                <p className="benefit-text">Tes commandes sont expédiées directement à tes clients dans des boîtes neutres, avec ton adresse de retour. Personne ne voit le mot « Plio » nulle part.</p>
                <div className="benefit-stat">Inclus dès le tier <strong>Studio</strong></div>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon">💰</div>
                <h3 className="benefit-title">Remises volume</h3>
                <p className="benefit-text">De <strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>5 % à 25 %</strong> selon ton volume mensuel. Pas de minimum à l'engagement, calculé sur les 30 derniers jours glissants.</p>
                <div className="benefit-stat">Auto-calculé chaque mois</div>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon">⚡</div>
                <h3 className="benefit-title">API REST</h3>
                <p className="benefit-text">Branche notre catalogue à ton Shopify, WooCommerce ou app sur mesure. Devis, commandes, suivi — tout en JSON.</p>
                <div className="benefit-stat">Documentation OpenAPI · zéro frais d'API</div>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon">🎨</div>
                <h3 className="benefit-title">Marque blanche</h3>
                <p className="benefit-text">Tes factures sortent à ton entête. Tes courriels de tracking aussi. Tu personnalises le sous-domaine (<code style={{ fontFamily: "var(--font-mono)", fontSize: "12px", padding: "2px 6px", background: "var(--bg-sunken)", borderRadius: "4px" } as React.CSSProperties}>print.tonagence.com</code>).</p>
                <div className="benefit-stat">Disponible tier <strong>Agency</strong></div>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon">👥</div>
                <h3 className="benefit-title">Multi-utilisateurs</h3>
                <p className="benefit-text">Invite ton équipe avec rôles (admin, designer, comptable). Facturation centralisée, accès séparés par client.</p>
                <div className="benefit-stat">Jusqu'à <strong>15 sièges</strong> inclus</div>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon">📞</div>
                <h3 className="benefit-title">Account manager dédié</h3>
                <p className="benefit-text">Un contact humain par téléphone et courriel pour rush, devis personnalisés, et urgences. Réponse <strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>sous 30 min</strong> en jours ouvrables.</p>
                <div className="benefit-stat">Tier <strong>Studio</strong> et plus</div>
              </div>
            </div>
          </section>
      
          {/* WORKFLOW (dark) */}
          <section className="workflow-section" style={{ maxWidth: "none", padding: "0" } as React.CSSProperties}>
            <div className="workflow-section-inner">
              <div className="section-eyebrow">Comment ça marche</div>
              <h2 className="section-title">De ton client à <em>la presse</em> en 4 étapes.</h2>
              <p className="section-lede">Tu restes l'unique point de contact pour ton client. On reste invisible.</p>
      
              <div className="workflow-steps">
                <div className="wf-step">
                  <div className="wf-num">01</div>
                  <h3 className="wf-title">Configure le devis</h3>
                  <p className="wf-text">Wizard intuitif ou API. Ajoute ta marge automatique — fixe ou pourcentage.</p>
                  <div className="wf-meta">~2 min</div>
                </div>
                <div className="wf-step">
                  <div className="wf-num">02</div>
                  <h3 className="wf-title">Facture ton client</h3>
                  <p className="wf-text">Génère une facture à ton nom (PDF) ou paiement Stripe sur ton sous-domaine.</p>
                  <div className="wf-meta">Marque blanche</div>
                </div>
                <div className="wf-step">
                  <div className="wf-num">03</div>
                  <h3 className="wf-title">On imprime</h3>
                  <p className="wf-text">Production à Markham. Prépresse vérifiée par notre équipe.</p>
                  <div className="wf-meta">2-7 jours</div>
                </div>
                <div className="wf-step">
                  <div className="wf-num">04</div>
                  <h3 className="wf-title">Livraison blind</h3>
                  <p className="wf-text">UPS livre directement chez ton client. Boîte neutre, ton adresse de retour.</p>
                  <div className="wf-meta">0 mention Plio</div>
                </div>
              </div>
            </div>
          </section>
      
          {/* TIERS */}
          <section>
            <div className="section-eyebrow">Tiers de remise</div>
            <h2 className="section-title">Plus tu <em>vends,</em> moins tu paies.</h2>
            <p className="section-lede">Remises calculées sur ton volume mensuel glissant. Aucun engagement, aucune cotisation.</p>
      
            <div className="tiers-grid">
              <div className="tier-card">
                <h3 className="tier-name">Starter</h3>
                <p className="tier-desc">Premiers pas</p>
                <span className="tier-spend">0 — 500 $/mois</span>
                <div className="tier-discount">5<span className="unit"> %</span></div>
                <ul className="tier-list">
                  <li>Remise auto sur catalogue</li>
                  <li>5 échantillons / mois</li>
                  <li>Templates gratuits</li>
                  <li>Support courriel</li>
                </ul>
              </div>
              <div className="tier-card">
                <h3 className="tier-name">Pro</h3>
                <p className="tier-desc">Freelances actifs</p>
                <span className="tier-spend">500 — 2 500 $/mois</span>
                <div className="tier-discount">10<span className="unit"> %</span></div>
                <ul className="tier-list">
                  <li>Tout de Starter +</li>
                  <li>Échantillons illimités</li>
                  <li>Prépresse prioritaire</li>
                  <li>Wallet avec bonus 3 %</li>
                </ul>
              </div>
              <div className="tier-card featured">
                <h3 className="tier-name">Studio</h3>
                <p className="tier-desc">Studios &amp; agences</p>
                <span className="tier-spend">2 500 — 10 000 $/mois</span>
                <div className="tier-discount">18<span className="unit"> %</span></div>
                <ul className="tier-list">
                  <li>Tout de Pro +</li>
                  <li>★ Blind shipping inclus</li>
                  <li>Account manager dédié</li>
                  <li>Multi-utilisateurs (5)</li>
                  <li>Wallet bonus 5 %</li>
                  <li>API access</li>
                </ul>
              </div>
              <div className="tier-card">
                <h3 className="tier-name">Agency</h3>
                <p className="tier-desc">Grosses agences</p>
                <span className="tier-spend">10 000 $+ /mois</span>
                <div className="tier-discount">25<span className="unit"> %</span></div>
                <ul className="tier-list">
                  <li>Tout de Studio +</li>
                  <li>Marque blanche complète</li>
                  <li>Sous-domaine custom</li>
                  <li>15 sièges inclus</li>
                  <li>SLA contractuel</li>
                  <li>Wallet bonus 8 %</li>
                </ul>
              </div>
            </div>
          </section>
      
          {/* FINAL CTA */}
          <div className="final-cta">
            <h2>Prêt à <em>imprimer pour tes clients ?</em></h2>
            <p>Inscription gratuite, validation sous 24h, premier devis offert.</p>
            <a href="/sign-up" className="hero-cta-primary">Postuler au programme →</a>
          </div>
        </main>
    </>
  );
}
