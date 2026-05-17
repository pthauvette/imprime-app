/**
 * Auto-migrated from Open Design HTML artifact `pricing.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Tarifs — Plio" };

export default function PricingPage() {
  return (
    <>
      <nav className="mkt-nav">
          <a href="/" className="mkt-brand">Plio.</a>
          <div className="mkt-nav-links">
            <a href="#" className="mkt-nav-link">Produits</a>
            <a href="/pricing" className="mkt-nav-link active">Tarifs</a>
            <a href="/reseller" className="mkt-nav-link">Reseller</a>
            <a href="/help" className="mkt-nav-link">Aide</a>
            <a href="/sign-in" className="mkt-nav-link">Se connecter</a>
            <a href="/sign-up" className="mkt-nav-cta">S'inscrire →</a>
          </div>
        </nav>
      
        <main>
          {/* HERO */}
          <section className="pricing-hero">
            <div className="hero-eyebrow">Tarifs transparents</div>
            <h1>Pas d'abonnement. <em>Tu paies au print.</em></h1>
            <p>Prix wholesale dès la première commande. Les tiers débloquent des remises et features avancées, automatiquement selon ton volume.</p>
      
            <div className="billing-toggle">
              <button className="active">Mensuel</button>
              <button>Annuel <span className="save">−15 %</span></button>
            </div>
          </section>
      
          {/* TIERS */}
          <section className="tiers-section">
            <div className="tiers-grid">
              {/* Free */}
              <div className="price-card">
                <div className="pc-header">
                  <h3 className="pc-name">Gratuit</h3>
                  <p className="pc-desc">Premier devis offert. Idéal pour découvrir.</p>
                </div>
                <div className="pc-price">
                  <span className="pc-price-amount">0</span>
                  <span className="pc-price-currency">$</span>
                  <span className="pc-price-unit">à vie</span>
                </div>
                <span className="pc-tagline">Aucune carte requise</span>
                <button className="pc-cta">S'inscrire →</button>
                <ul className="pc-feature-list">
                  <li>Catalogue complet (1 200+ produits)</li>
                  <li>Devis instantané illimité</li>
                  <li>Templates &amp; guides gratuits</li>
                  <li><strong>5 échantillons</strong> par mois</li>
                  <li>Support courriel (sous 24h)</li>
                  <li className="disabled">Pas de remise volume</li>
                  <li className="disabled">Pas de wallet bonus</li>
                </ul>
              </div>
      
              {/* Pro */}
              <div className="price-card">
                <div className="pc-header">
                  <h3 className="pc-name">Pro</h3>
                  <p className="pc-desc">Freelances qui commandent régulièrement.</p>
                </div>
                <div className="pc-price">
                  <span className="pc-price-amount">19</span>
                  <span className="pc-price-currency">$</span>
                  <span className="pc-price-unit">/ mois</span>
                </div>
                <span className="pc-tagline">★ Économise dès 200 $ d'achats</span>
                <button className="pc-cta">Démarrer Pro →</button>
                <ul className="pc-feature-list">
                  <li>Tout de Gratuit +</li>
                  <li><strong>10 %</strong> de remise wholesale</li>
                  <li>Échantillons <strong>illimités</strong></li>
                  <li>Wallet bonus <strong>+3 %</strong></li>
                  <li>Prépresse prioritaire (sous 1h)</li>
                  <li>Support courriel (sous 4h)</li>
                  <li className="disabled">Pas de blind shipping</li>
                </ul>
              </div>
      
              {/* Studio (featured) */}
              <div className="price-card featured">
                <div className="pc-header">
                  <h3 className="pc-name">Studio</h3>
                  <p className="pc-desc">Studios &amp; agences qui revendent du print.</p>
                </div>
                <div className="pc-price">
                  <span className="pc-price-amount">59</span>
                  <span className="pc-price-currency">$</span>
                  <span className="pc-price-unit">/ mois</span>
                </div>
                <span className="pc-tagline">★ Marge moyenne 18 %</span>
                <button className="pc-cta">Démarrer Studio →</button>
                <ul className="pc-feature-list">
                  <li>Tout de Pro +</li>
                  <li><strong>18 %</strong> de remise wholesale</li>
                  <li>★ <strong>Blind shipping</strong> inclus</li>
                  <li>Account manager dédié</li>
                  <li>Wallet bonus <strong>+5 %</strong></li>
                  <li>Multi-utilisateurs (5 sièges)</li>
                  <li>API REST &amp; webhooks</li>
                  <li>Support tél &amp; courriel (30 min)</li>
                </ul>
              </div>
      
              {/* Agency */}
              <div className="price-card">
                <div className="pc-header">
                  <h3 className="pc-name">Agency</h3>
                  <p className="pc-desc">Grosses agences avec volume mensuel élevé.</p>
                </div>
                <div className="pc-price">
                  <span className="pc-price-amount">Sur</span>
                  <span className="pc-price-currency" style={{ fontFamily: "var(--font-display)", fontSize: "64px", letterSpacing: "-0.04em", color: "var(--text-primary)" } as React.CSSProperties}>mesure</span>
                </div>
                <span className="pc-tagline">★ Dès 10 000 $/mois</span>
                <button className="pc-cta">Nous parler →</button>
                <ul className="pc-feature-list">
                  <li>Tout de Studio +</li>
                  <li>Jusqu'à <strong>25 %</strong> de remise</li>
                  <li>Marque blanche complète</li>
                  <li>Sous-domaine personnalisé</li>
                  <li><strong>15 sièges</strong> inclus</li>
                  <li>Wallet bonus <strong>+8 %</strong></li>
                  <li>SLA contractuel</li>
                  <li>Onboarding sur place</li>
                </ul>
              </div>
            </div>
          </section>
      
          {/* COMPARISON TABLE */}
          <section className="compare-section">
            <div className="compare-section-inner">
              <h2>Comparaison <em>détaillée.</em></h2>
              <p>Tous les détails de chaque tier, côte à côte.</p>
      
              <div className="compare-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fonctionnalités</th>
                      <th className="tier-head"><div className="th-inner"><span className="th-name">Gratuit</span><span className="th-price">0 $ / mois</span></div></th>
                      <th className="tier-head"><div className="th-inner"><span className="th-name">Pro</span><span className="th-price">19 $ / mois</span></div></th>
                      <th className="tier-head featured-col"><div className="th-inner"><span className="th-name">Studio</span><span className="th-price">59 $ / mois</span></div></th>
                      <th className="tier-head"><div className="th-inner"><span className="th-name">Agency</span><span className="th-price">Sur devis</span></div></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="section-row"><td colSpan={5} className="section-label">★ Catalogue &amp; commandes</td></tr>
                    <tr>
                      <td className="feature">Catalogue complet<span className="meta">1 200+ produits</span></td>
                      <td className="val yes"></td><td className="val yes"></td><td className="val yes featured-cell"></td><td className="val yes"></td>
                    </tr>
                    <tr>
                      <td className="feature">Devis instantané illimité</td>
                      <td className="val yes"></td><td className="val yes"></td><td className="val yes featured-cell"></td><td className="val yes"></td>
                    </tr>
                    <tr>
                      <td className="feature">Remise wholesale<span className="meta">Calculée sur catalogue de base</span></td>
                      <td className="val no"></td><td className="val yes">10 %</td><td className="val yes featured-cell">18 %</td><td className="val yes">25 %</td>
                    </tr>
                    <tr>
                      <td className="feature">Wallet bonus<span className="meta">Sur recharges 500 $+</span></td>
                      <td className="val no"></td><td className="val yes">+3 %</td><td className="val yes featured-cell">+5 %</td><td className="val yes">+8 %</td>
                    </tr>
      
                    <tr className="section-row"><td colSpan={5} className="section-label">★ Production &amp; livraison</td></tr>
                    <tr>
                      <td className="feature">Prépresse prioritaire<span className="meta">Délai de vérification</span></td>
                      <td className="val">Sous 2h</td><td className="val">Sous 1h</td><td className="val featured-cell">Sous 30 min</td><td className="val">Instantané</td>
                    </tr>
                    <tr>
                      <td className="feature">Blind shipping<span className="meta">Boîtes neutres + adresse retour à toi</span></td>
                      <td className="val no"></td><td className="val no"></td><td className="val yes featured-cell"></td><td className="val yes"></td>
                    </tr>
                    <tr>
                      <td className="feature">Échantillons gratuits</td>
                      <td className="val">5 / mois</td><td className="val">Illimités</td><td className="val featured-cell">Illimités</td><td className="val">Illimités</td>
                    </tr>
      
                    <tr className="section-row"><td colSpan={5} className="section-label">★ Marque blanche &amp; équipe</td></tr>
                    <tr>
                      <td className="feature">Factures à ton entête</td>
                      <td className="val no"></td><td className="val yes"></td><td className="val yes featured-cell"></td><td className="val yes"></td>
                    </tr>
                    <tr>
                      <td className="feature">Sous-domaine custom<span className="meta">print.tonagence.com</span></td>
                      <td className="val no"></td><td className="val no"></td><td className="val no featured-cell"></td><td className="val yes"></td>
                    </tr>
                    <tr>
                      <td className="feature">Multi-utilisateurs<span className="meta">Avec rôles séparés</span></td>
                      <td className="val">1 siège</td><td className="val">1 siège</td><td className="val featured-cell">5 sièges</td><td className="val">15 sièges</td>
                    </tr>
      
                    <tr className="section-row"><td colSpan={5} className="section-label">★ API &amp; intégrations</td></tr>
                    <tr>
                      <td className="feature">API REST &amp; webhooks<span className="meta">Documentation OpenAPI</span></td>
                      <td className="val no"></td><td className="val no"></td><td className="val yes featured-cell"></td><td className="val yes"></td>
                    </tr>
                    <tr>
                      <td className="feature">Plugin Shopify / WooCommerce</td>
                      <td className="val no"></td><td className="val no"></td><td className="val yes featured-cell"></td><td className="val yes"></td>
                    </tr>
      
                    <tr className="section-row"><td colSpan={5} className="section-label">★ Support</td></tr>
                    <tr>
                      <td className="feature">Support courriel</td>
                      <td className="val">Sous 24h</td><td className="val">Sous 4h</td><td className="val featured-cell">Sous 30 min</td><td className="val">Sous 15 min</td>
                    </tr>
                    <tr>
                      <td className="feature">Support téléphone</td>
                      <td className="val no"></td><td className="val no"></td><td className="val yes featured-cell"></td><td className="val yes"></td>
                    </tr>
                    <tr>
                      <td className="feature">Account manager dédié</td>
                      <td className="val no"></td><td className="val no"></td><td className="val yes featured-cell"></td><td className="val yes"></td>
                    </tr>
                    <tr>
                      <td className="feature">SLA contractuel<span className="meta">Garanties écrites de délai</span></td>
                      <td className="val no"></td><td className="val no"></td><td className="val no featured-cell"></td><td className="val yes"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
      
          {/* FAQ */}
          <section className="pricing-faq">
            <h2>Questions sur les <em>tarifs.</em></h2>
            <p>Tout ce qui n'est pas évident en regardant la grille.</p>
      
            <div className="faq-list">
              <div className="faq-item open">
                <div className="faq-q">Puis-je changer de tier à tout moment ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Oui. Upgrade instantané, downgrade au prochain cycle de facturation. Aucun frais de changement. Si tu downgrades, tes commandes passées gardent le tarif d'origine.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">L'abonnement mensuel inclut-il du print ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Non. L'abonnement débloque la remise et les features (blind shipping, API, etc.). Le print est facturé séparément, au prix wholesale moins ta remise.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Comment fonctionnent les remises de volume ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Pour les resellers (Studio et Agency), une seconde remise auto-calculée s'ajoute sur les 30 derniers jours glissants. Elle vient en plus de la remise du tier.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Y a-t-il une période d'essai pour Pro et Studio ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Oui — 14 jours gratuits sur Pro et 30 jours gratuits sur Studio. Pas de carte de crédit requise pour l'essai. Annulation en un clic.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Comment puis-je passer en Agency ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Si tu dépasses 10 000 $/mois sur trois mois consécutifs, notre équipe te contacte. Sinon, demande directement un devis sur cette page — pas de minimum d'engagement contraignant.</div>
              </div>
            </div>
          </section>
        </main>
    </>
  );
}
