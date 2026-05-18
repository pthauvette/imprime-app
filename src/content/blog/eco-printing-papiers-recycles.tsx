/**
 * Article : éco-impression et papiers recyclés.
 * Cible SEO : "impression écologique Canada", "papier recyclé carte de visite".
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'eco-printing-papiers-recycles-canada',
  title: 'Impression écologique au Canada : papiers recyclés, encres végétales, certifications',
  excerpt: 'Le kraft 100 % recyclé, l\'encre soja, le bilan carbone réel d\'une impression locale vs offshore — démêle le greenwashing.',
  date: '2026-03-15',
  author: 'Équipe Plio',
  tags: ['guide', 'eco', 'papier'],
  readingMinutes: 6,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        &laquo; Imprimé sur papier recyclé &raquo; est devenu un slogan vide tellement
        c&apos;est utilisé sans contexte. Voici ce qui compte vraiment pour réduire
        l&apos;impact environnemental d&apos;une commande d&apos;impression au Canada — et
        comment éviter le greenwashing.
      </p>

      <h2>Recyclé : combien de %, et fait par qui ?</h2>
      <p>
        Tous les papiers &laquo; recyclés &raquo; ne se valent pas. La fourchette va de
        10 % à 100 %, et la matière post-consommation (vraies fibres recyclées de
        produits usagés) est très différente des chutes pré-consommation (réutilisation des
        retailles d&apos;usine).
      </p>
      <ul>
        <li>
          <strong>100 % post-consommation</strong> — le standard sérieux. Les fibres
          viennent de papier déjà utilisé puis collecté. Notre kraft naturel est de cette
          catégorie.
        </li>
        <li>
          <strong>30-50 % recyclé mixte</strong> — courant dans l&apos;industrie, plus
          économique. Mélange fibres vierges + recyclées. Acceptable mais à signaler
          honnêtement.
        </li>
        <li>
          <strong>Pré-consommation seulement</strong> — c&apos;est juste l&apos;usine qui
          réutilise ses chutes. Pas vraiment du recyclage au sens où le client l&apos;entend.
        </li>
      </ul>

      <h2>Certifications à connaître</h2>

      <h3>FSC (Forest Stewardship Council)</h3>
      <p>
        Garantit que le papier vient de forêts gérées durablement. Pas du recyclage en
        soi, mais une assurance que l&apos;exploitation forestière respecte des standards
        environnementaux + sociaux. La plupart de nos stocks sont FSC certifiés.
      </p>

      <h3>EcoLogo / UL ECOLOGO</h3>
      <p>
        Certification canadienne (program Environment Canada). Évalue le cycle de vie
        complet. Plus rigoureux que FSC mais moins universellement reconnu.
      </p>

      <h3>SFI (Sustainable Forestry Initiative)</h3>
      <p>
        Alternative nord-américaine à FSC. Standards similaires. Industrie forestière
        majoritaire au Canada/US utilise SFI.
      </p>

      <h2>Encres : la partie qu&apos;on oublie</h2>
      <p>
        L&apos;encre traditionnelle (pétrochimique) contient des COV (composés organiques
        volatils) émis à l&apos;impression. Les alternatives modernes :
      </p>
      <ul>
        <li>
          <strong>Encres à base de soja</strong> — bio-source, basse COV, couleurs vives.
          Notre presse partenaire utilise du soja sur les commandes standard.
        </li>
        <li>
          <strong>Encres à base d&apos;eau</strong> — encore plus faibles COV. Disponible
          sur les presses inkjet grand format (bannières).
        </li>
        <li>
          <strong>Encres UV</strong> — pas de COV mais le coating UV n&apos;est pas
          biodégradable. Tradeoff selon ta priorité.
        </li>
      </ul>

      <h2>Local vs offshore : le vrai bilan carbone</h2>
      <p>
        Une carte imprimée localement (au Canada) émet moins de CO₂ qu&apos;une carte
        imprimée en Asie + shipping international, même si le papier est 100 % recyclé
        offshore. Le transport est typiquement 60-70 % du carbone d&apos;une commande
        d&apos;impression.
      </p>
      <p>
        Plio imprime 100 % au Canada via notre presse partenaire en Ontario. Distance
        moyenne client → presse : ~500 km. Vs un imprimeur low-cost en Inde : +15 000 km.
        Mathématiquement, c&apos;est ~10× moins de CO₂ par carte chez nous.
      </p>

      <h2>Ce que tu peux faire concrètement</h2>
      <ol>
        <li>
          <strong>Choisis nos stocks recyclés quand pertinent.</strong> Le kraft 100 %
          recyclé est notre option la plus eco. Esthétique tactile artisanale en bonus.
        </li>
        <li>
          <strong>Commande la bonne quantité.</strong> 500 cartes que tu utilises = 500
          cartes nécessaires. 1 000 cartes que tu jettes en moitié dans 2 ans = 500
          cartes gaspillées. Le wizard Plio te montre les paliers — choisis ce que tu
          vas réellement utiliser.
        </li>
        <li>
          <strong>Évite les finitions plastifiées si possible.</strong> Le soft touch et
          la lamination ajoutent une couche non-recyclable. Mat ou UV simple sont plus
          eco. Si tu as vraiment besoin du soft touch, accepte le tradeoff.
        </li>
        <li>
          <strong>Préfère le format standard.</strong> Les formats custom génèrent plus
          de chutes à la coupe. Un 3,5×2 ou un 4,25×6 produit moins de gaspillage qu&apos;un
          format unique.
        </li>
      </ol>

      <p className="blog-cta">
        <strong>Nos options eco :</strong> kraft 100 % recyclé + encres soja + impression
        locale Canada. <a href="/order/start">Configure ta commande →</a>
      </p>
    </>
  );
}
