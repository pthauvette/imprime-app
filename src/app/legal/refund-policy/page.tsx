/**
 * /legal/refund-policy — policy de remboursement.
 */

import MarketingFooter from '@/components/marketing/MarketingFooter';
import { Icon } from '@/components/ui/Icon';

export const metadata = { title: "Remboursement — Plio" };

export default function RefundPolicyPage() {
  return (
    <>
      <nav className="mkt-nav">
          <a href="/" className="mkt-brand">Plio.</a>
          <div className="mkt-nav-links">
            <a href="/order/start" className="mkt-nav-link">Produits</a>
            <a href="/about" className="mkt-nav-link">Notre histoire</a>
            <a href="/help" className="mkt-nav-link">Aide</a>
            <a href="/contact" className="mkt-nav-link">Contact</a>
            <a href="/order/start" className="mkt-nav-cta">Commander →</a>
          </div>
        </nav>
      
        <main>
          {/* HERO */}
          <section className="refund-hero">
            <div className="page-eyebrow">Politique de remboursement · 3 juillet 2026</div>
            <h1>Un défaut ? <em>On réimprime.</em></h1>
            <p>Notre garantie tient en 3 cas : erreur de notre part, défaut de qualité, ou annulation avant le lancement en production. On priorise la réimpression ; le remboursement suit lorsqu'une réimpression n'est pas possible.</p>
          </section>
      
          {/* SCENARIOS */}
          <section className="scenarios">
            <div className="scenarios-grid">
              <div className="scenario green">
                <div className="scenario-icon"><Icon name="check" /></div>
                <div className="scenario-num"><Icon name="star" size={14} /> Cas 01</div>
                <h2>Erreur de prepress</h2>
                <p>Si l'erreur vient de <strong>chez nous</strong> — une bévue de notre opérateur ou de la presse — on <strong>réimprime gratuitement</strong>, généralement mis en production sous 48 h ouvrables. Si la réimpression n'est pas possible, on te rembourse.</p>
                <p>Aucune question, aucun formulaire. Une photo suffit.</p>
                <div className="scenario-meta">
                  <span className="scenario-pill">Réimpression gratuite</span>
                  <a href="#faq" className="scenario-link">Voir les exemples →</a>
                </div>
              </div>
      
              <div className="scenario warning">
                <div className="scenario-icon">!</div>
                <div className="scenario-num"><Icon name="star" size={14} /> Cas 02</div>
                <h2>Défaut de qualité</h2>
                <p>Inspecte ton colis à la réception. Si tu trouves un défaut imputable à la presse (taches, coupe hors tolérance, papier abîmé), envoie une photo dans les <strong>10 jours ouvrables</strong> à <a href="mailto:bonjour@plio.ca" style={{ color: "var(--accent-primary)", textDecoration: "underline" } as React.CSSProperties}>bonjour@plio.ca</a>. Un dommage visible à la réception se signale dans les 24 h.</p>
                <p>On réimprime le tirage. Si la réimpression n'est pas possible, on rembourse (délai bancaire <strong>5 à 10 jours</strong> après acceptation).</p>
                <div className="scenario-meta">
                  <span className="scenario-pill">10 jours pour réclamer</span>
                  <a href="/contact" className="scenario-link">Ouvrir un ticket →</a>
                </div>
              </div>
      
              <div className="scenario info">
                <div className="scenario-icon">i</div>
                <div className="scenario-num"><Icon name="star" size={14} /> Cas 03</div>
                <h2>Changement d'avis</h2>
                <p>Tu peux <strong>demander l&apos;annulation</strong> depuis ton compte tant que ta commande n&apos;a pas été <strong>lancée en production</strong> chez notre imprimeur — ce qui survient souvent quelques minutes après le paiement. Si la production n&apos;a pas commencé, on rembourse sur ta carte d&apos;origine (délai bancaire 5 à 10 jours).</p>
                <p>Une fois la production commencée, l&apos;annulation devient plus difficile : notre imprimeur applique des <strong>frais d&apos;annulation (min. 25 $ par article)</strong> lorsque le travail est déjà en préparation, et elle peut ne plus être possible selon l&apos;avancement. Ces frais, ainsi que le matériel et le temps machine engagés, sont déduits du remboursement.</p>
                <div className="scenario-meta">
                  <span className="scenario-pill">Avant le lancement en production</span>
                  <a href="/orders" className="scenario-link">Mes commandes →</a>
                </div>
              </div>
            </div>
          </section>
      
          {/* TIMELINE */}
          <section className="timeline-section">
            <div className="timeline-inner">
              <div className="timeline-eyebrow"><Icon name="star" size={14} /> Comment ça se passe</div>
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
              <div className="refund-faq-eyebrow"><Icon name="star" size={14} /> Détails et cas particuliers</div>
              <h2 className="refund-faq-title">Les cas <em>moins évidents.</em></h2>
              <p className="refund-faq-lede">Tout ce qui ne tient pas dans les trois cartes ci-dessus, on l'a documenté ici.</p>
            </div>
      
            <div className="faq-list">
              <details className="faq-item" open>
                <summary className="faq-q">Quel est le délai pour réclamer ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Tu as <strong>10 jours ouvrables à compter de la livraison</strong> pour signaler un défaut (coupe, impression, papier). Au-delà, la commande est réputée acceptée. Un dommage <em>visible</em> à la réception se signale dans les 24 h. Plus tu nous écris tôt, plus vite on règle — et ça nous permet de faire valoir ton dossier auprès de notre imprimeur dans les délais.</div>
              </details>
      
              <details className="faq-item">
                <summary className="faq-q">Que se passe-t-il si Postes Canada (ou UPS) perd mon colis ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Le risque de transport passe au transporteur dès la remise du colis (cf. nos <a href="/legal/terms" style={{ color: "var(--accent-primary)", textDecoration: "underline" } as React.CSSProperties}>conditions</a>, art. 5). Si le tracking n'a pas bougé depuis <strong>10 jours ouvrables</strong>, on ouvre une enquête avec le transporteur et on te tient informé. Une fois la perte confirmée, on organise une réimpression ou un dédommagement selon l'indemnisation obtenue. C'est nous qui gérons la réclamation transporteur pour toi.</div>
              </details>
      
              <details className="faq-item">
                <summary className="faq-q">Puis-je échanger contre un autre produit ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Pas directement, parce que chaque commande est imprimée sur mesure (pas de stock). Si la réimpression a un motif valide (erreur de notre côté, défaut de fabrication confirmé), on réimprime le bon produit ; si ce n'est pas possible, on <strong>rembourse ta commande initiale</strong>. Non applicable à un simple changement d'avis une fois la production lancée.</div>
              </details>
      
              <details className="faq-item">
                <summary className="faq-q">Comment ça se passe pour un reseller ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Si ton client final trouve un défaut, le reseller (toi) ouvre le ticket avec nous. <strong>Le remboursement va sur la carte du reseller</strong>, jamais directement au client final — c'est à toi de gérer la relation commerciale en aval. Les délais et critères sont identiques aux commandes B2C.</div>
              </details>
      
              <details className="faq-item">
                <summary className="faq-q">Et si la couleur imprimée ne correspond pas à mon écran ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Ton écran utilise un profil RVB rétro-éclairé, la presse imprime en CMJN sur papier réflectif — il y aura toujours un écart, c'est de la physique. La reproduction exacte des couleurs <strong>n'est pas garantie</strong> et une variation raisonnable est normale (elle ne constitue pas un défaut), en particulier sur les produits à vernis ou pelliculage. Pour une couleur critique (logo de marque, packaging), commande un <strong>tirage d'épreuve physique</strong> à 18 $ avant la grande série — c'est le seul moyen fiable de valider le rendu réel.</div>
              </details>
      
              <details className="faq-item">
                <summary className="faq-q">Qui paie le retour du colis défectueux ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Le plus souvent, les photos suffisent et <strong>tu n'as rien à retourner</strong>. Dans certains cas, notre imprimeur exige toutefois le retour du produit défectueux avant d'émettre la réimpression ou le remboursement : on t'envoie alors une <strong>étiquette prépayée</strong> et on te demande de poster le colis sous 15 jours. Tu n'as aucuns frais de retour à ta charge.</div>
              </details>
      
              <details className="faq-item">
                <summary className="faq-q">Mon fichier était mauvais mais le validateur n'a rien dit. Qui paie ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Notre validateur automatique vérifie ce qui est <strong>techniquement mesurable</strong> : le fond perdu (bleed), les dimensions du PDF et la résolution des images. Le <strong>mode couleur et les polices ne sont pas validés automatiquement</strong> — la couleur est convertie en CMJN à la presse, et il t'incombe d'aplatir/vectoriser tes polices. Le validateur ne juge pas non plus le design (faute de frappe, mauvais numéro, choix esthétique) : ces erreurs restent à ta charge. La validation est une <strong>aide</strong>, pas un substitut à ta vérification finale du bon à tirer.</div>
              </details>
      
              <details className="faq-item">
                <summary className="faq-q">Combien de fois puis-je faire réimprimer une commande ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Sur un défaut de fabrication confirmé, on réimprime. Si la réimpression présente encore le <strong>même défaut confirmé</strong>, on te rembourse intégralement plutôt que de relancer indéfiniment.</div>
              </details>
            </div>
          </section>
      
          {/* CTA */}
          <div className="cta-section">
            <h2>Un problème <em>maintenant ?</em></h2>
            <p>Notre équipe répond en moins de 4 h ouvrables. On préfère résoudre vite plutôt que de t'écrire un courriel par jour pendant deux semaines.</p>
            <div className="cta-actions">
              <a href="/contact" className="cta-btn-primary">Ouvrir un ticket →</a>
              <a href="/help" className="cta-btn-secondary">Centre d'aide</a>
            </div>
          </div>
        </main>
      
        <MarketingFooter />
    </>
  );
}
