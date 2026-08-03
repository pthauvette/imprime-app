/**
 * /legal/terms — conditions d'utilisation.
 */

import { getCompanyIdentity } from '@/lib/company/identity';
import { Icon } from '@/components/ui/Icon';

export const metadata = { title: "Conditions d'utilisation" };

export default function TermsPage() {
  // Source UNIQUE de l'identité fiscale (env Amplify) — évite des numéros
  // factices hardcodés sur un document à valeur légale. Fallback honnête
  // « (… à venir) » tant que les vraies vars ne sont pas définies.
  const company = getCompanyIdentity();
  return (
    <>
      <nav className="legal-nav">
          <a href="/" className="legal-brand">Plio.</a>
          <a href="/" className="legal-back">← Retour à l'accueil</a>
        </nav>
      
        <main>
          <header className="legal-header">
            <div className="legal-eyebrow">Dernière mise à jour · 3 juillet 2026</div>
            <h1>Conditions <em>d'utilisation.</em></h1>
            <p>Ces conditions encadrent ton utilisation d'Plio, exploité par Démocratik inc. Lis-les attentivement — en passant une commande, tu confirmes les avoir acceptées intégralement.</p>
          </header>
      
          <div className="legal-body">
            {/* TOC */}
            <aside className="legal-toc">
              <div className="toc-label">Table des matières</div>
              <ul className="toc-list">
                <li><a href="#s1" className="active"><span className="toc-num">01</span><span>Acceptation des conditions</span></a></li>
                <li><a href="#s2"><span className="toc-num">02</span><span>Description du service</span></a></li>
                <li><a href="#s3"><span className="toc-num">03</span><span>Compte utilisateur</span></a></li>
                <li><a href="#s4"><span className="toc-num">04</span><span>Commandes et paiement</span></a></li>
                <li><a href="#s5"><span className="toc-num">05</span><span>Livraison et risque</span></a></li>
                <li><a href="#s6"><span className="toc-num">06</span><span>Garantie et retours</span></a></li>
                <li><a href="#s7"><span className="toc-num">07</span><span>Propriété intellectuelle</span></a></li>
                <li><a href="#s8"><span className="toc-num">08</span><span>Limitations de responsabilité</span></a></li>
                <li><a href="#s9"><span className="toc-num">09</span><span>Loi applicable</span></a></li>
                <li><a href="#s10"><span className="toc-num">10</span><span>Modifications</span></a></li>
                <li><a href="#s11"><span className="toc-num">11</span><span>Contact</span></a></li>
              </ul>
            </aside>
      
            {/* CONTENT */}
            <article className="legal-content">
              <section id="s1">
                <h2><span className="h-num">Article 01</span>Acceptation des conditions</h2>
                <p>En accédant au site plio.ca, en créant un compte ou en passant une commande, l'utilisateur déclare avoir lu, compris et accepté sans réserve les présentes conditions générales d'utilisation et de vente. Ces conditions constituent un contrat ayant force exécutoire entre l'utilisateur et Démocratik inc., société constituée en vertu des lois du Québec, exerçant ses activités sous la dénomination commerciale « Plio ».</p>
                <p>L'utilisateur reconnaît être âgé d'au moins dix-huit (18) ans ou avoir atteint l'âge de la majorité dans sa province de résidence, et avoir la capacité juridique requise pour contracter. Toute utilisation du service par une personne morale présuppose que la personne physique agissant pour son compte dispose des pouvoirs nécessaires.</p>
                <p>Si l'utilisateur n'accepte pas l'une quelconque des stipulations qui suivent, il doit s'abstenir d'utiliser le service. La poursuite de la navigation au-delà de la page d'accueil vaut acceptation tacite des conditions en vigueur à la date de la connexion.</p>
              </section>
      
              <section id="s2">
                <h2><span className="h-num">Article 02</span>Description du service</h2>
                <p>Plio propose une plateforme web permettant aux utilisateurs de configurer, prévisualiser, commander et faire livrer des produits imprimés (cartes de visite, dépliants, bannières, packaging et autres supports). Le service comprend un moteur de tarification en temps réel, un module de validation prépresse automatisée, ainsi qu'un suivi de production et de livraison.</p>
                <p>La production physique des commandes est assurée par un partenaire d'impression wholesale établi à Markham (Ontario), avec qui Démocratik inc. entretient une relation contractuelle. Plio demeure l'unique interlocuteur commercial de l'utilisateur final et assume la responsabilité du service, conformément aux limitations énoncées à l'article 8.</p>
                <p>Le service est offert « tel quel ». Démocratik inc. se réserve le droit, à tout moment et sans préavis, de modifier, suspendre ou interrompre tout ou partie des fonctionnalités, sans qu'aucune indemnité ne puisse être réclamée à ce titre.</p>
              </section>
      
              <section id="s3">
                <h2><span className="h-num">Article 03</span>Compte utilisateur</h2>
                <p>L'utilisation des fonctionnalités transactionnelles d'Plio requiert la création d'un compte personnel. Les informations communiquées lors de l'inscription (nom, courriel, adresse de facturation, numéro de téléphone) doivent être exactes, complètes et tenues à jour par l'utilisateur tout au long de la relation contractuelle.</p>
                <p>L'utilisateur est seul responsable de la confidentialité de son mot de passe et de toute activité effectuée à partir de son compte. Toute opération réalisée à l'aide des identifiants de l'utilisateur est réputée avoir été effectuée par celui-ci. En cas d'utilisation non autorisée de son compte, l'utilisateur s'engage à en informer Plio sans délai à l'adresse <a href="mailto:security@plio.ca">security@plio.ca</a>.</p>
                <p>Démocratik inc. se réserve le droit de suspendre ou de résilier sans préavis tout compte présentant un comportement frauduleux, abusif ou contraire aux présentes conditions, ainsi que tout compte demeuré inactif pendant une période continue de vingt-quatre (24) mois.</p>
              </section>
      
              <section id="s4">
                <h2><span className="h-num">Article 04</span>Commandes et paiement</h2>
                <p>Toute commande passée sur la plateforme constitue une offre ferme et irrévocable de la part de l'utilisateur. Le contrat de vente n'est conclu qu'à compter de l'envoi par Plio d'une confirmation de commande à l'adresse courriel fournie. Les prix affichés sont exprimés en dollars canadiens (CAD), hors taxes applicables. Les taxes provinciales et fédérales pertinentes sont ajoutées en fin de panier conformément à la législation en vigueur.</p>
                <p>Le paiement s'effectue intégralement à la commande par carte de crédit (Visa, Mastercard, American Express) via la plateforme sécurisée <strong>Stripe</strong>. Plio ne stocke aucune donnée de carte bancaire sur ses serveurs. L'utilisateur garantit disposer des autorisations nécessaires à l'utilisation du moyen de paiement employé.</p>
                <p>En cas d'incident de paiement (chargeback, opposition non motivée, fonds insuffisants), Plio se réserve le droit de suspendre toute commande en cours, d'annuler l'expédition et de réclamer le remboursement des frais administratifs et de production déjà engagés, lesquels sont forfaitairement fixés à cinquante dollars (50 $) par incident.</p>
                <div className="legal-callout">
                  <strong>Tarification dynamique.</strong> Les prix sont susceptibles de fluctuer en fonction du coût des matières premières et des paramètres logistiques. Le prix applicable est exclusivement celui affiché au moment de la confirmation de commande.
                </div>
              </section>
      
              <section id="s5">
                <h2><span className="h-num">Article 05</span>Livraison et risque</h2>
                <p>Les commandes sont expédiées depuis l'installation de production située à Markham (Ontario) par transporteur tiers (UPS ou FedEx, à la discrétion d'Plio ou selon le choix de l'utilisateur). Les délais de livraison communiqués lors du devis sont indicatifs et n'engagent Plio qu'à titre de meilleurs efforts. Aucun retard de livraison ne saurait justifier l'annulation de la commande ni le versement de dommages-intérêts.</p>
                <p>Le transfert des risques s'opère à compter de la remise des marchandises au transporteur. Il appartient au destinataire de vérifier l'intégrité du colis à la réception et d'émettre toute réserve par écrit auprès du transporteur dans un délai maximal de vingt-quatre (24) heures.</p>
                <p>Les expéditions traversant la frontière canado-américaine sont soumises aux droits de douane, taxes d'importation et formalités applicables, lesquels demeurent à la charge exclusive du destinataire. Plio ne traite pas, à ce jour, les commandes à destination des territoires situés hors du Canada continental.</p>
              </section>
      
              <section id="s6">
                <h2><span className="h-num">Article 06</span>Garantie et retours</h2>
                <p>Plio garantit la conformité des produits livrés au fichier et à la configuration que l'utilisateur a validés au moment de la commande, tels que vérifiés automatiquement à l'étape de téléversement (fond perdu, dimensions, résolution). Toute réclamation pour non-conformité doit être adressée dans un délai de <strong>dix (10) jours ouvrables</strong> à compter de la livraison, accompagnée de photographies du défaut allégué et du numéro de commande. Passé ce délai, les produits sont réputés acceptés.</p>
                <p>Les défauts couverts incluent notamment les erreurs d'impression imputables à la presse et les défauts de coupe ou de finition excédant la tolérance industrielle de <strong>1/16 de pouce (≈ 1,6 mm) par côté</strong>. Conformément aux usages de l'industrie de l'impression, une variation de la quantité livrée n'excédant pas <strong>cinq pour cent (5 %)</strong>, en plus ou en moins, constitue une livraison conforme ; seule une quantité inférieure de plus de 5 % à la commande ouvre droit à réclamation. En revanche, ne sont pas couverts : les écarts colorimétriques entre le rendu à l'écran (RVB) et le rendu imprimé (CMJN), la reproduction des couleurs n'étant pas garantie et une variation raisonnable étant inhérente au procédé — y compris sur les produits à vernis ou à pelliculage ; les variations de teinte d'un tirage à l'autre ; ni les défauts résultant d'un fichier source non conforme. La validation automatique des fichiers est fournie à titre d'assistance et ne garantit pas l'absence d'erreur de conception (texte, mise en page, couleurs) ; l'utilisateur demeure seul responsable du contenu et de la mise en page du fichier qu'il téléverse.</p>
                <p>En cas de défaut reconnu, Plio procédera en priorité à la <strong>réimpression gratuite</strong> de la commande. Un remboursement du prix payé pourra être accordé, à la discrétion de Plio, lorsqu'une réimpression n'est pas possible ou ne corrige pas le défaut ; le cas échéant, il est traité dans un délai de cinq (5) à dix (10) jours ouvrables après acceptation de la réclamation. Pour davantage de détails, l'utilisateur est invité à consulter notre <a href="/legal/refund-policy">politique de remboursement</a>.</p>
              </section>
      
              <section id="s7">
                <h2><span className="h-num">Article 07</span>Propriété intellectuelle</h2>
                <p>L'utilisateur garantit être titulaire de l'ensemble des droits de propriété intellectuelle attachés aux fichiers transmis à Plio, ou disposer d'une autorisation expresse et écrite des titulaires de ces droits. L'utilisateur reconnaît être seul responsable du contenu transmis et garantit Plio et le tient indemne contre toute réclamation, action ou condamnation en contrefaçon, en concurrence déloyale, en parasitisme, en diffamation ou en atteinte à la vie privée ou aux droits de la personnalité d'un tiers, engagée à raison desdits fichiers, y compris les dommages, frais, coûts et honoraires d'avocats raisonnables qui en découleraient.</p>
                <p>Plio se réserve le droit de refuser toute commande dont le contenu porte atteinte aux droits de tiers, aux bonnes mœurs, à l'ordre public, ou contrevient à la législation canadienne (notamment en matière de haine, de pornographie infantile ou de propagande terroriste). Ce refus n'ouvre droit à aucune indemnité, mais donne lieu au remboursement intégral des sommes versées.</p>
                <p>Les éléments composant le site plio.ca (textes, logos, code source, marques, base de données) demeurent la propriété exclusive de Démocratik inc. et sont protégés par le droit d'auteur canadien ainsi que par les conventions internationales applicables.</p>
              </section>
      
              <section id="s8">
                <h2><span className="h-num">Article 08</span>Limitations de responsabilité</h2>
                <p>La responsabilité d'Plio, toutes causes confondues, est strictement limitée au montant hors taxes effectivement payé par l'utilisateur au titre de la commande litigieuse. En aucun cas, Plio ne saurait être tenu responsable des dommages indirects, immatériels ou consécutifs, tels que perte de chiffre d'affaires, atteinte à l'image, perte d'exploitation ou préjudice commercial.</p>
                <p>Plio ne saurait être tenu responsable des conséquences d'un cas de force majeure tel que défini par la jurisprudence québécoise, incluant notamment : grève d'un transporteur, panne d'électricité prolongée, cyberattaque, pandémie, restrictions gouvernementales, défaillance d'un partenaire de production ou tout évènement échappant raisonnablement à son contrôle.</p>
                <p>Aucune disposition des présentes ne saurait toutefois avoir pour effet de limiter ou d'exclure la responsabilité d'Plio en cas de faute intentionnelle ou de faute lourde, ni en cas de préjudice corporel ou moral, conformément à l'article 1474 du <em>Code civil du Québec</em>.</p>
              </section>
      
              <section id="s9">
                <h2><span className="h-num">Article 09</span>Loi applicable et juridiction</h2>
                <p>Les présentes conditions sont régies par le droit applicable dans la province de Québec et, le cas échéant, par les lois fédérales du Canada qui s'y appliquent. Tout litige relatif à leur formation, leur interprétation ou leur exécution sera soumis à la compétence exclusive des tribunaux du district judiciaire de Montréal, à l'exclusion de toute autre juridiction.</p>
                <p>Préalablement à toute action judiciaire, les parties s'engagent à rechercher de bonne foi une solution amiable, le cas échéant en recourant à un médiateur agréé par le Centre canadien d'arbitrage commercial. Cette obligation préalable de médiation n'est pas applicable aux mesures conservatoires ni aux procédures de recouvrement de créances incontestables.</p>
              </section>
      
              <section id="s10">
                <h2><span className="h-num">Article 10</span>Modifications des conditions</h2>
                <p>Démocratik inc. se réserve le droit de modifier à tout moment les présentes conditions, notamment afin d'en assurer la conformité avec toute évolution législative, réglementaire ou jurisprudentielle. Les utilisateurs disposant d'un compte actif seront notifiés par courriel au moins quinze (15) jours avant l'entrée en vigueur des modifications substantielles.</p>
                <p>La poursuite de l'utilisation du service au-delà de la date d'entrée en vigueur des nouvelles conditions vaut acceptation tacite de celles-ci. L'utilisateur qui refuserait les modifications dispose de la faculté de fermer son compte sans frais, sans préjudice de l'exécution des commandes en cours.</p>
              </section>
      
              <section id="s11">
                <h2><span className="h-num">Article 11</span>Contact</h2>
                <p>Toute question relative aux présentes conditions, ainsi que toute notification ou réclamation, peut être adressée à Plio par les canaux suivants :</p>
                <ul>
                  <li>Courriel général : <a href="mailto:bonjour@plio.ca">bonjour@plio.ca</a></li>
                  <li>Service juridique : <a href="mailto:legal@plio.ca">legal@plio.ca</a></li>
                  <li>Adresse postale : Démocratik inc., 4220 boul. St-Laurent, suite 200, Montréal QC H2W 1Z3</li>
                </ul>
                <p>Notre équipe s'engage à accuser réception de toute correspondance écrite dans un délai maximal de cinq (5) jours ouvrables.</p>
              </section>
      
              <div className="legal-signature">
                <strong>Plio.</strong>
                Démocratik inc.<br />
                4220 boul. St-Laurent, suite 200, Montréal QC H2W 1Z3<br />
                Numéro d'entreprise du Québec · {company.neq}<br />
                TPS {company.gst} · TVQ {company.qst}
              </div>
            </article>
          </div>
        </main>
      
        <footer>
          <div className="footer-bottom">
            <span><Icon name="star" /> © Plio 2026 · Imprimé au Canada 🇨🇦</span>
            <span><a href="/legal/privacy">Confidentialité</a> · <a href="/legal/refund-policy">Remboursements</a> · <a href="/contact">Contact</a></span>
          </div>
        </footer>
    </>
  );
}
