/**
 * /legal/refund-policy — policy de remboursement.
 */

import MarketingFooter from '@/components/marketing/MarketingFooter';

export const metadata = { title: "Remboursement — Plio" };

export default function RefundPolicyPage() {
  return (
    <>
      <nav className="mkt-nav">
          <a href="/" className="mkt-brand">Plio.</a>
          <div className="mkt-nav-links">
            <a href="/order/start" className="mkt-nav-link">Produits</a>
            <a href="/about" className="mkt-nav-link">Notre histoire</a>
            <a href="/contact" className="mkt-nav-link">Aide</a>
            <a href="/contact" className="mkt-nav-link">Contact</a>
            <a href="/order/start" className="mkt-nav-cta">Commander →</a>
          </div>
        </nav>
      
        <main>
          {/* HERO */}
          <section className="refund-hero">
            <div className="page-eyebrow">Politique de remboursement · 16 mai 2026</div>
            <h1>Pas content ? <em>On rembourse.</em></h1>
            <p>Notre politique tient en 3 cas : erreur de notre part, défaut de qualité, ou changement d'avis avant que la presse démarre.</p>
          </section>
      
          {/* SCENARIOS */}
          <section className="scenarios">
            <div className="scenarios-grid">
              <div className="scenario green">
                <div className="scenario-icon">✓</div>
                <div className="scenario-num">★ Cas 01</div>
                <h2>Erreur de prepress</h2>
                <p>Si notre validateur a laissé passer un fichier qui sort mal — bleed manquant non détecté, profil couleur mal converti, ou erreur de notre opérateur — on rembourse <strong>100 %</strong> et on réimprime <strong>gratuit sous 48 h</strong>.</p>
                <p>Aucune question, aucun formulaire. Une photo suffit.</p>
                <div className="scenario-meta">
                  <span className="scenario-pill">Refund 100 %</span>
                  <a href="#faq" className="scenario-link">Voir les exemples →</a>
                </div>
              </div>
      
              <div className="scenario warning">
                <div className="scenario-icon">!</div>
                <div className="scenario-num">★ Cas 02</div>
                <h2>Défaut de qualité</h2>
                <p>Inspecte ton colis à la réception. Si tu trouves un défaut imputable à la presse (taches, mauvaise coupe, papier abîmé), envoie une photo dans les <strong>48 heures</strong> à <a href="mailto:bonjour@plio.ca" style={{ color: "var(--accent-primary)", textDecoration: "underline" } as React.CSSProperties}>bonjour@plio.ca</a>.</p>
                <p>On rembourse et on réimprime. Délai de remboursement : <strong>5 à 10 jours bancaires</strong> après acceptation.</p>
                <div className="scenario-meta">
                  <span className="scenario-pill">48 h pour réclamer</span>
                  <a href="/contact" className="scenario-link">Ouvrir un ticket →</a>
                </div>
              </div>
      
              <div className="scenario info">
                <div className="scenario-icon">i</div>
                <div className="scenario-num">★ Cas 03</div>
                <h2>Changement d'avis</h2>
                <p>Avant que la production démarre — généralement <strong>2 heures</strong> après le paiement — tu peux annuler en 1 clic depuis ton compte. <strong>Refund complet</strong>, instantané.</p>
                <p>Après le démarrage de la presse, ce n'est plus possible : on a déjà engagé du matériel, de l'encre et du temps machine.</p>
                <div className="scenario-meta">
                  <span className="scenario-pill">2 h pour annuler</span>
                  <a href="/orders" className="scenario-link">Mes commandes →</a>
                </div>
              </div>
            </div>
          </section>
      
          {/* TIMELINE */}
          <section className="timeline-section">
            <div className="timeline-inner">
              <div className="timeline-eyebrow">★ Comment ça se passe</div>
              <h2 className="timeline-title">Quand tu réclames, <em>voici le flux.</em></h2>
              <div className="timeline">
                <div className="timeline-step done">
                  <div className="timeline-num">01</div>
                  <div>
                    <h3>Photo + courriel</h3>
                    <p>Tu nous écris à bonjour@plio.ca avec ton numéro de commande et une ou deux photos du défaut.</p>
                    <div className="timeline-time">~ 2 minutes côté toi</div>
                  </div>
                </div>
                <div className="timeline-step">
                  <div className="timeline-num">02</div>
                  <div>
                    <h3>On confirme</h3>
                    <p>Notre équipe regarde, vérifie contre le BAT signé, et te répond avec la décision (et l'explication).</p>
                    <div className="timeline-time">Sous 4 h ouvrables</div>
                  </div>
                </div>
                <div className="timeline-step">
                  <div className="timeline-num">03</div>
                  <div>
                    <h3>Refund initié</h3>
                    <p>On déclenche le remboursement chez Stripe sur ta carte d'origine. Aucune action requise de ton côté.</p>
                    <div className="timeline-time">Le jour même</div>
                  </div>
                </div>
                <div className="timeline-step">
                  <div className="timeline-num">04</div>
                  <div>
                    <h3>Sur ton compte</h3>
                    <p>Le montant réapparaît sur ton relevé, selon le délai de ta banque (souvent plus rapide pour Stripe).</p>
                    <div className="timeline-time">5 à 10 jours bancaires</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
      
          {/* FAQ */}
          <section id="faq" className="refund-faq">
            <div className="refund-faq-head">
              <div className="refund-faq-eyebrow">★ Détails et cas particuliers</div>
              <h2 className="refund-faq-title">Les cas <em>moins évidents.</em></h2>
              <p className="refund-faq-lede">Tout ce qui ne tient pas dans les trois cartes ci-dessus, on l'a documenté ici.</p>
            </div>
      
            <div className="faq-list">
              <div className="faq-item open">
                <div className="faq-q">Quel est le délai pour réclamer ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Tu as <strong>48 heures à compter de la livraison</strong> pour signaler un défaut visuel (coupe, impression, papier). Au-delà, on considère le colis accepté. Pour une erreur de prepress flagrante, le délai est étendu à <strong>30 jours</strong> — on couvre l'erreur même si tu réalises sur le tard.</div>
              </div>
      
              <div className="faq-item">
                <div className="faq-q">Que se passe-t-il si Postes Canada (ou UPS) perd mon colis ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Si le tracking n'a pas bougé depuis <strong>10 jours ouvrables</strong>, on ouvre une enquête avec le transporteur. Pendant ce temps, on lance la <strong>réimpression à nos frais</strong> sans attendre la conclusion — tu n'as pas à patienter sur le résultat de l'enquête. C'est nous qui gérons la réclamation transporteur.</div>
              </div>
      
              <div className="faq-item">
                <div className="faq-q">Puis-je échanger contre un autre produit ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Pas directement, parce que chaque commande est imprimée sur mesure (pas de stock). Mais on peut <strong>rembourser ta commande initiale</strong> et te donner un <strong>crédit bonus de 10 %</strong> à appliquer sur ta nouvelle commande, à la condition que la réimpression ait un motif valide (erreur de prepress, défaut). Pas applicable aux changements d'avis post-production.</div>
              </div>
      
              <div className="faq-item">
                <div className="faq-q">Comment ça se passe pour un reseller ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Si ton client final trouve un défaut, le reseller (toi) ouvre le ticket avec nous. <strong>Le remboursement va sur la carte du reseller</strong>, jamais directement au client final — c'est à toi de gérer la relation commerciale en aval. Les délais et critères sont identiques aux commandes B2C.</div>
              </div>
      
              <div className="faq-item">
                <div className="faq-q">Et si la couleur imprimée ne correspond pas à mon écran ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Ton écran utilise un profil RGB rétro-éclairé, la presse imprime en CMYK sur papier réflectif — il y aura toujours un écart, c'est de la physique. On garantit la conformité au <strong>BAT numérique CMYK</strong> que tu as validé, avec une tolérance industrielle de <strong>Delta-E ≤ 4</strong>. Au-delà, c'est un défaut couvert. Pour les commandes critiques (logo de marque, packaging), commande un <strong>tirage d'épreuve</strong> à 18 $ avant la grande série.</div>
              </div>
      
              <div className="faq-item">
                <div className="faq-q">Qui paie le retour du colis défectueux ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">En général, <strong>tu n'as rien à retourner</strong>. Les photos suffisent pour les défauts visuels. Si on a besoin de récupérer le colis pour analyse (rare, ~3 % des cas), on t'envoie une étiquette UPS prépayée. Tu ne sors pas un cent de ta poche.</div>
              </div>
      
              <div className="faq-item">
                <div className="faq-q">Mon fichier était mauvais mais le validateur n'a rien dit. Qui paie ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Notre validateur couvre les erreurs <strong>techniquement détectables</strong> : bleed, résolution, mode couleur, fonts manquantes. Pour ces cas, si on a laissé passer, c'est <strong>de notre faute</strong> — réimpression gratuite. Par contre, le validateur ne juge pas le design (faute de frappe, mauvais numéro de téléphone, choix esthétique malheureux) — ces erreurs restent à ta charge.</div>
              </div>
      
              <div className="faq-item">
                <div className="faq-q">Combien de fois puis-je faire réimprimer une commande ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Une réimpression couverte par garantie est <strong>illimitée tant que le défaut persiste</strong>. Si la première réimpression sort aussi mal, on relance — c'est notre problème, pas le tien. En pratique, ça arrive dans moins de 0,3 % des cas grâce au double contrôle qualité de notre presse.</div>
              </div>
            </div>
          </section>
      
          {/* CTA */}
          <div className="cta-section">
            <h2>Un problème <em>maintenant ?</em></h2>
            <p>Notre équipe répond en moins de 4 h ouvrables. On préfère résoudre vite plutôt que de t'écrire un courriel par jour pendant deux semaines.</p>
            <div className="cta-actions">
              <a href="/contact" className="cta-btn-primary">Ouvrir un ticket →</a>
              <a href="/contact" className="cta-btn-secondary">Centre d'aide</a>
            </div>
          </div>
        </main>
      
        <MarketingFooter />
    </>
  );
}
