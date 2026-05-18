/**
 * Article : cartes postales marketing direct (direct mail).
 * Cible SEO : "cartes postales marketing", "direct mail Canada".
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'cartes-postales-marketing-direct-mail-canada',
  title: 'Cartes postales marketing : le canal sous-estimé en 2026',
  excerpt: 'Postes Canada distribue 11 milliards de pièces par année. Une carte postale bien ciblée a un taux de réponse 5× supérieur à un email cold.',
  date: '2026-03-25',
  author: 'Équipe Plio',
  tags: ['guide', 'cartes-postales', 'marketing'],
  readingMinutes: 5,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        Si tu lis ça, tu fais probablement du marketing digital. Tu connais l&apos;email open
        rate (~20 %), le CTR Facebook (~1 %), la fatigue créative des audiences chaudes.
        Voici un fait sous-estimé : le direct mail bien ciblé a un taux de réponse de
        4-5 % selon DMA — environ 5× supérieur à un email cold. Et il devient moins cher
        à l&apos;échelle qu&apos;une campagne Meta Ads ciblée.
      </p>

      <h2>Pourquoi la carte postale marche</h2>
      <ol>
        <li>
          <strong>Pas de filtre.</strong> Personne n&apos;a installé un AdBlock sur sa
          boîte aux lettres. Le taux d&apos;arrivée est ~100 %, vs ~50-70 % pour les
          emails marketing (Gmail Promotions tab).
        </li>
        <li>
          <strong>Sensation tactile = mémoire.</strong> Étude Royal Mail UK (2018) :
          les annonces print ont 33 % d&apos;impact mémoire en plus que digital
          équivalent. Le toucher active une partie du cerveau que l&apos;écran ne touche
          pas.
        </li>
        <li>
          <strong>Pas de subject line à optimiser.</strong> Avec un email, le 80 % du
          travail est de faire ouvrir. Avec une carte postale, le message est visible
          immédiatement — la décision est de l&apos;ignorer ou pas en 1 seconde.
        </li>
      </ol>

      <h2>4 use cases qui convertissent</h2>

      <h3>1. Réactivation de clients dormants</h3>
      <p>
        Tes clients qui n&apos;ont pas commandé depuis 6-12 mois ne lisent plus tes
        emails. Une carte postale avec un code promo nominatif (« David, voici 15 % pour
        revenir ») a un taux de réactivation de 8-12 % selon nos clients qui ont testé.
      </p>

      <h3>2. Annonce d&apos;ouverture / déménagement</h3>
      <p>
        Pour les commerces locaux, c&apos;est presque mandatory. Postes Canada Toutes
        Résidences (TR) te laisse cibler par code postal de 200-500 adresses chacun, à
        partir de ~0,20 $/pièce livré. Distribution 100 % géographique, idéal pour un
        rayon de 1 km autour de ton commerce.
      </p>

      <h3>3. Carte de remerciement post-achat</h3>
      <p>
        Très rare donc très mémorable. Un client qui dépense 200 $+ et reçoit une carte
        écrite à la main une semaine plus tard parle de toi à 3-5 personnes en moyenne
        (NPS boost). Coût : ~1 $/carte tout inclus. ROI difficile à mesurer mais réel sur
        la rétention long-terme.
      </p>

      <h3>4. Invitation événement / lancement produit</h3>
      <p>
        La carte postale crée un sense of occasion que l&apos;email n&apos;a pas. Pour
        des soirées portes ouvertes, lancements de collection, événements VIP, le format
        physique signale que c&apos;est sérieux.
      </p>

      <h2>Spécifications recommandées</h2>
      <p>
        Le format standard cartes postales chez Plio :
      </p>
      <ul>
        <li><strong>4,25 × 6 pouces</strong> — format Postes Canada standard, qualifie pour le tarif machinable (moins cher)</li>
        <li><strong>14pt UV high gloss</strong> — solide pour le transit, couleurs éclatantes</li>
        <li><strong>Recto-verso pleine couleur</strong> — utilise les 2 côtés, le verso est ton CTA + tes coordonnées</li>
        <li><strong>Bleed 3 mm + safe zone 5 mm</strong> — surtout côté adresse (Postes Canada y appose un code-barres)</li>
      </ul>

      <h2>Design qui convertit</h2>
      <p>
        Règle du 3-second test : si quelqu&apos;un regarde ta carte 3 secondes et n&apos;a
        rien compris, foutu. Pour passer ce test :
      </p>
      <ul>
        <li><strong>Headline géant en haut</strong> (qui es-tu + l&apos;offre)</li>
        <li><strong>Visuel fort, pas un collage</strong> (1 image &gt; 6 vignettes)</li>
        <li><strong>UN call to action</strong> (téléphone, URL courte, QR code, code promo)</li>
        <li><strong>Date de fin si offre limitée</strong> (urgence motive)</li>
        <li><strong>Identité de marque claire</strong> (logo + couleurs + ton)</li>
      </ul>

      <h2>Quantités et budget</h2>
      <ul>
        <li><strong>Test (500 cartes)</strong> : ~120-150 $ + postage ~100 $ = ~250 $ total. Tester le creative avant scaling.</li>
        <li><strong>Petite campagne (2 500)</strong> : ~450 $ + postage ~500 $ = ~950 $. Pour 1-2 quartiers ciblés.</li>
        <li><strong>Distribution complète (10 000+)</strong> : ~1 800 $ + postage ~2 000 $ = ~3 800 $. Pour un lancement régional.</li>
      </ul>
      <p>
        Le postage Postes Canada via TR (Toutes Résidences) coûte ~0,20-0,25 $/pièce.
        Ajouter ~0,10-0,15 $ pour l&apos;impression Plio = total ~0,30-0,40 $/pièce
        livrée. Compare à un Google Ad CPC de 2-5 $ pour la même industrie locale.
      </p>

      <p className="blog-cta">
        <strong>Imprime tes cartes postales :</strong> wizard Plio gère le format 4,25×6
        + bleed automatique + UV gloss. <a href="/order/start">Démarrer une commande →</a>
      </p>
    </>
  );
}
