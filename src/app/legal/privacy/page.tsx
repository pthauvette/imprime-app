/**
 * Auto-migrated from Open Design HTML artifact `privacy.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Confidentialité — Plio" };

export default function PrivacyPage() {
  return (
    <>
      <nav className="legal-nav">
          <a href="landing.html" className="legal-brand">Plio.</a>
          <a href="landing.html" className="legal-back">← Retour à l'accueil</a>
        </nav>
      
        <main>
          <header className="legal-header">
            <div className="legal-eyebrow">Dernière mise à jour · 16 mai 2026</div>
            <h1>Politique de <em>confidentialité.</em></h1>
            <p>Tu nous confies ton courriel, ton adresse, ton fichier de design. On te doit en retour une transparence totale sur ce qu'on en fait. Voici tout, sans jargon.</p>
            <div className="compliance-row">
              <span className="compliance-chip">Loi 25 · Québec</span>
              <span className="compliance-chip">LPRPDE · Canada</span>
              <span className="compliance-chip">RGPD · UE</span>
              <span className="compliance-chip">Pas de revente de données</span>
            </div>
          </header>
      
          <div className="legal-body">
            <aside className="legal-toc">
              <div className="toc-label">Table des matières</div>
              <ul className="toc-list">
                <li><a href="#s1" className="active"><span className="toc-num">01</span><span>Quelles données on collecte</span></a></li>
                <li><a href="#s2"><span className="toc-num">02</span><span>Comment on les utilise</span></a></li>
                <li><a href="#s3"><span className="toc-num">03</span><span>Partage avec des tiers</span></a></li>
                <li><a href="#s4"><span className="toc-num">04</span><span>Cookies et tracking</span></a></li>
                <li><a href="#s5"><span className="toc-num">05</span><span>Conservation</span></a></li>
                <li><a href="#s6"><span className="toc-num">06</span><span>Tes droits</span></a></li>
                <li><a href="#s7"><span className="toc-num">07</span><span>Sécurité</span></a></li>
                <li><a href="#s8"><span className="toc-num">08</span><span>Notifications de breach</span></a></li>
                <li><a href="#s9"><span className="toc-num">09</span><span>Modifications</span></a></li>
                <li><a href="#s10"><span className="toc-num">10</span><span>Contact</span></a></li>
              </ul>
            </aside>
      
            <article className="legal-content">
              <section id="s1">
                <h2><span className="h-num">Article 01</span>Quelles données on collecte</h2>
                <p>Plio collecte uniquement les informations strictement nécessaires à l'exécution de ta commande, à la sécurité de ton compte et à l'amélioration mesurée de notre service. Aucune donnée n'est collectée à des fins de profilage publicitaire externe.</p>
                <p>Les catégories de données sont détaillées dans le tableau ci-dessous, à des fins de transparence. Pour chaque donnée, nous précisons son origine, l'usage que nous en faisons et sa durée de conservation.</p>
      
                <div className="data-table-wrap">
                  <div className="data-table-title">Tableau des données collectées</div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Donnée</th>
                        <th>Origine</th>
                        <th>Usage</th>
                        <th>Conservation</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="col-key">Courriel</td>
                        <td>Toi (compte / commande)</td>
                        <td>Connexion, confirmation, suivi de commande</td>
                        <td className="duration">Vie du compte</td>
                      </tr>
                      <tr>
                        <td className="col-key">Nom complet</td>
                        <td>Toi (compte / facturation)</td>
                        <td>Facturation, étiquette de colis</td>
                        <td className="duration">7 ans (loi fiscale)</td>
                      </tr>
                      <tr>
                        <td className="col-key">Adresse de livraison</td>
                        <td>Toi (commande)</td>
                        <td>Expédition par UPS / FedEx</td>
                        <td className="duration">7 ans (loi fiscale)</td>
                      </tr>
                      <tr>
                        <td className="col-key">Carte de crédit</td>
                        <td>Stripe (jamais stockée chez nous)</td>
                        <td>Paiement de la commande</td>
                        <td className="duration">N/A · tokenisée</td>
                      </tr>
                      <tr>
                        <td className="col-key">Adresse IP</td>
                        <td>Auto (requête HTTP)</td>
                        <td>Sécurité, anti-fraude, analytics</td>
                        <td className="duration">90 jours</td>
                      </tr>
                      <tr>
                        <td className="col-key">Fichier de design</td>
                        <td>Toi (téléversement)</td>
                        <td>Prépresse, impression, réimpression</td>
                        <td className="duration">2 ans après livraison</td>
                      </tr>
                      <tr>
                        <td className="col-key">Données de navigation</td>
                        <td>Auto (cookies first-party)</td>
                        <td>Mesure d'audience anonymisée</td>
                        <td className="duration">13 mois max</td>
                      </tr>
                      <tr>
                        <td className="col-key">Numéro de téléphone</td>
                        <td>Toi · optionnel</td>
                        <td>Notification du transporteur</td>
                        <td className="duration">Vie du compte</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
      
              <section id="s2">
                <h2><span className="h-num">Article 02</span>Comment on les utilise</h2>
                <p>Les données collectées servent exclusivement à des finalités explicites, légitimes et documentées. Plus précisément, nous traitons tes informations afin de :</p>
                <ul>
                  <li>Exécuter ta commande (configuration, prépresse, production, expédition, suivi);</li>
                  <li>Gérer ton compte, ton historique d'achat et tes préférences;</li>
                  <li>Émettre les factures, percevoir les taxes applicables et conserver les pièces comptables;</li>
                  <li>Te notifier d'évènements liés à ta commande (confirmation, expédition, livraison, retard, réclamation);</li>
                  <li>Améliorer le service par des analyses anonymisées et agrégées;</li>
                  <li>Prévenir la fraude (paiement non autorisé, abus de compte, scraping);</li>
                  <li>Respecter nos obligations légales, comptables et fiscales canadiennes.</li>
                </ul>
                <p>Aucun traitement automatisé produisant des effets juridiques significatifs n'est effectué à ton égard. Aucune décision d'attribution ou de refus de commande n'est prise sans intervention humaine.</p>
              </section>
      
              <section id="s3">
                <h2><span className="h-num">Article 03</span>Partage avec des tiers</h2>
                <p>Plio travaille avec un nombre volontairement restreint de sous-traitants techniques, chacun lié par un accord de traitement de données conforme à la Loi 25 et au RGPD. La liste exhaustive est la suivante :</p>
      
                <div className="third-party-grid">
                  <div className="tp-card">
                    <div className="tp-name">Stripe</div>
                    <div className="tp-role">Paiement</div>
                    <div className="tp-desc">Traite la carte bancaire. Plio ne voit jamais le numéro complet — uniquement les 4 derniers chiffres et le type de carte.</div>
                  </div>
                  <div className="tp-card">
                    <div className="tp-name">Sinalite</div>
                    <div className="tp-role">Production</div>
                    <div className="tp-desc">Reçoit ton fichier et l'adresse de livraison pour imprimer et expédier ta commande depuis Markham (ON).</div>
                  </div>
                  <div className="tp-card">
                    <div className="tp-name">AWS · Canada-Central</div>
                    <div className="tp-role">Hébergement</div>
                    <div className="tp-desc">Héberge nos serveurs et notre base de données. Localisation exclusive à Montréal (région ca-central-1).</div>
                  </div>
                  <div className="tp-card">
                    <div className="tp-name">Resend</div>
                    <div className="tp-role">Courriel transactionnel</div>
                    <div className="tp-desc">Envoie les confirmations de commande et les notifications. Aucun usage marketing sans opt-in explicite.</div>
                  </div>
                  <div className="tp-card">
                    <div className="tp-name">UPS · FedEx</div>
                    <div className="tp-role">Transporteurs</div>
                    <div className="tp-desc">Reçoivent ton nom et l'adresse pour la livraison. Pas d'autres données partagées.</div>
                  </div>
                  <div className="tp-card">
                    <div className="tp-name">Plausible Analytics</div>
                    <div className="tp-role">Analytique</div>
                    <div className="tp-desc">Mesure d'audience sans cookies, conforme RGPD/Loi 25 par défaut. Hébergé en UE, données agrégées.</div>
                  </div>
                </div>
      
                <p>Aucune donnée personnelle n'est revendue, louée ou cédée à des fins publicitaires. Aucun partenaire publicitaire (Meta, Google Ads, TikTok) n'a accès à tes informations.</p>
              </section>
      
              <section id="s4">
                <h2><span className="h-num">Article 04</span>Cookies et tracking</h2>
                <p>Plio applique une politique cookies minimaliste : aucun cookie tiers publicitaire, aucun pixel de tracking cross-site, aucun outil de fingerprinting comportemental.</p>
                <p>Les cookies utilisés se limitent à ceux strictement nécessaires au fonctionnement du service :</p>
                <ul>
                  <li><strong>od_session</strong> — maintien de la session utilisateur (HTTPOnly, SameSite=Strict);</li>
                  <li><strong>od_cart</strong> — sauvegarde du panier en cours pendant 7 jours;</li>
                  <li><strong>od_csrf</strong> — protection contre les requêtes intersites falsifiées;</li>
                  <li><strong>od_theme</strong> — mémorisation de ton choix clair/sombre.</li>
                </ul>
                <p>L'outil de mesure d'audience (Plausible) n'utilise aucun cookie. Tu n'as donc rien à accepter ou à refuser à l'arrivée sur le site — ce qui explique l'absence de bannière intrusive.</p>
              </section>
      
              <section id="s5">
                <h2><span className="h-num">Article 05</span>Conservation des données</h2>
                <p>Les durées de conservation sont définies en fonction de la finalité de chaque traitement et des obligations légales applicables. Les durées détaillées figurent dans le tableau de l'article 1. À titre récapitulatif :</p>
                <ul>
                  <li>Données de compte actif : pendant toute la durée de vie du compte;</li>
                  <li>Pièces comptables (factures, adresses de facturation) : 7 ans, conformément à la Loi sur les impôts du Québec;</li>
                  <li>Fichiers de design soumis à production : 2 ans après livraison, pour permettre une réimpression rapide;</li>
                  <li>Données techniques (logs, IP) : 90 jours;</li>
                  <li>Compte inactif : suppression automatique après 24 mois d'inactivité, sur notification préalable.</li>
                </ul>
                <p>Tu peux demander la suppression anticipée de toutes les données non soumises à une obligation légale de conservation en écrivant à notre déléguée à la protection des données à <a href="mailto:dpo@plio.ca">dpo@plio.ca</a>.</p>
              </section>
      
              <section id="s6">
                <h2><span className="h-num">Article 06</span>Tes droits</h2>
                <p>En vertu de la Loi 25 du Québec et, le cas échéant, du RGPD pour les résidents européens, tu disposes des droits suivants à l'égard de tes données :</p>
      
                <div className="rights-grid">
                  <div className="right-card">
                    <div className="rc-icon">★ ACCÈS</div>
                    <strong>Droit de consultation</strong>
                    <p>Obtenir une copie de toutes les données te concernant que nous détenons.</p>
                  </div>
                  <div className="right-card">
                    <div className="rc-icon">★ RECTIFICATION</div>
                    <strong>Droit de correction</strong>
                    <p>Corriger toute donnée inexacte ou incomplète.</p>
                  </div>
                  <div className="right-card">
                    <div className="rc-icon">★ EFFACEMENT</div>
                    <strong>Droit à l'oubli</strong>
                    <p>Demander la suppression de tes données (hors obligations légales).</p>
                  </div>
                  <div className="right-card">
                    <div className="rc-icon">★ PORTABILITÉ</div>
                    <strong>Export structuré</strong>
                    <p>Recevoir tes données dans un format ouvert et réutilisable (JSON).</p>
                  </div>
                  <div className="right-card">
                    <div className="rc-icon">★ OPPOSITION</div>
                    <strong>Refus de traitement</strong>
                    <p>T'opposer à un traitement particulier pour motif légitime.</p>
                  </div>
                  <div className="right-card">
                    <div className="rc-icon">★ RETRAIT</div>
                    <strong>Retrait du consentement</strong>
                    <p>Retirer à tout moment ton consentement aux courriels marketing.</p>
                  </div>
                </div>
      
                <p>Pour exercer ces droits, écris à <a href="mailto:dpo@plio.ca">dpo@plio.ca</a> avec ton adresse courriel de compte. Nous répondons dans un délai maximal de <strong>30 jours</strong>, gratuitement. Si la réponse ne te satisfait pas, tu peux saisir la Commission d'accès à l'information du Québec.</p>
              </section>
      
              <section id="s7">
                <h2><span className="h-num">Article 07</span>Sécurité</h2>
                <p>Nous mettons en œuvre des mesures techniques et organisationnelles raisonnables pour protéger tes données contre l'accès non autorisé, la perte, l'altération ou la divulgation accidentelle. Ces mesures incluent notamment :</p>
                <ul>
                  <li>Chiffrement TLS 1.3 pour toutes les communications client-serveur;</li>
                  <li>Chiffrement au repos (AES-256) des bases de données et des sauvegardes;</li>
                  <li>Authentification à deux facteurs disponible pour tous les comptes;</li>
                  <li>Hachage bcrypt des mots de passe avec coût adaptatif;</li>
                  <li>Sauvegardes chiffrées quotidiennes avec rétention de 30 jours;</li>
                  <li>Audits de sécurité externes annuels par cabinet indépendant.</li>
                </ul>
                <p>Aucun système n'étant infaillible, nous ne pouvons garantir une sécurité absolue. Toutefois, nous nous engageons à appliquer en permanence l'état de l'art en matière de cybersécurité pour les services SaaS canadiens.</p>
              </section>
      
              <section id="s8">
                <h2><span className="h-num">Article 08</span>Notifications de breach</h2>
                <p>En cas de violation de la confidentialité ou de l'intégrité de tes données présentant un risque sérieux pour tes droits, nous nous engageons à te notifier individuellement <strong>dans les 72 heures</strong> suivant la prise de connaissance de l'incident, conformément aux obligations de la Loi 25.</p>
                <p>La notification précisera : la nature de l'incident, les catégories de données concernées, les mesures déjà prises pour le contenir, ainsi que les actions recommandées pour limiter ton exposition. Une déclaration est simultanément adressée à la Commission d'accès à l'information du Québec.</p>
                <p>Un registre interne des incidents est tenu à jour et peut être consulté par les autorités compétentes sur demande.</p>
              </section>
      
              <section id="s9">
                <h2><span className="h-num">Article 09</span>Modifications de la politique</h2>
                <p>La présente politique peut être révisée pour refléter une évolution de notre service, de nos sous-traitants ou de la législation applicable. Toute modification substantielle te sera notifiée par courriel au moins 15 jours avant son entrée en vigueur.</p>
                <p>L'historique complet des versions est disponible sur demande à <a href="mailto:dpo@plio.ca">dpo@plio.ca</a>. La date de la dernière mise à jour figure en haut du présent document.</p>
              </section>
      
              <section id="s10">
                <h2><span className="h-num">Article 10</span>Contact</h2>
                <p>Pour toute question relative à la protection de tes données ou à la présente politique, notre déléguée à la protection des données reste joignable :</p>
                <ul>
                  <li>Courriel : <a href="mailto:dpo@plio.ca">dpo@plio.ca</a></li>
                  <li>Postal : Démocratik inc. · À l'attention de la DPD · 4220 boul. St-Laurent, suite 200, Montréal QC H2W 1Z3</li>
                </ul>
                <div className="legal-callout">
                  <strong>Une question simple ?</strong> Avant de saisir la DPD, n'hésite pas à essayer le <a href="contact.html">formulaire de contact général</a>. Nous redirigeons vers la bonne personne en interne.
                </div>
              </section>
            </article>
          </div>
        </main>
      
        <footer>
          <div className="footer-bottom">
            <span>★ © Plio 2026 · Imprimé au Canada 🇨🇦</span>
            <span><a href="terms.html">Conditions</a> · <a href="refund-policy.html">Remboursements</a> · <a href="contact.html">Contact</a></span>
          </div>
        </footer>
    </>
  );
}
