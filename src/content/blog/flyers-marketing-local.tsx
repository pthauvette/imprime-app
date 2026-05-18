/**
 * Article : guide flyers pour marketing local.
 *
 * Cible SEO : "flyers marketing local", "impression flyers Montréal",
 * "distribution flyers commerce". Conversational, axé conversion.
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'flyers-marketing-local-petits-commerces',
  title: 'Flyers pour marketing local : ce qui marche encore en 2026',
  excerpt: 'Le flyer est mort, parait-il. Sauf qu\'un dépliant bien fait dans la bonne boîte aux lettres convertit 5× plus qu\'une pub Instagram. Le guide complet.',
  date: '2026-04-20',
  author: 'Équipe Plio',
  tags: ['guide', 'flyers', 'marketing'],
  readingMinutes: 6,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        Les digital natives disent que le flyer est mort. Les commerçants qui en distribuent
        depuis 20 ans savent que c&apos;est faux. La vérité : un flyer bien fait, bien
        distribué, dans le bon contexte, convertit toujours mieux que la plupart des
        campagnes Facebook. Voici comment maximiser ton ROI.
      </p>

      <h2>Pourquoi le flyer marche encore</h2>
      <p>
        Trois raisons que les agences digitales oublient souvent :
      </p>
      <ol>
        <li>
          <strong>Géographie ultra-ciblée.</strong> Tu sais exactement où ton flyer va
          atterrir. Aucun algorithme à manipuler, aucun ciblage à débugger. Tu choisis le
          quartier, point.
        </li>
        <li>
          <strong>Objet physique = mémoire physique.</strong> Un email Gmail s&apos;archive
          en 3 secondes. Un flyer sur ton comptoir reste 3 jours et te re-rappelle à chaque
          fois que tu prépares un café.
        </li>
        <li>
          <strong>Zéro compétition par-dessus.</strong> Quand ton client ouvre sa boîte
          aux lettres, il n&apos;y a pas 50 autres marques qui se battent pour son
          attention au même moment.
        </li>
      </ol>

      <h2>Les 4 contextes où le flyer brille</h2>

      <h3>1. Ouverture / lancement local</h3>
      <p>
        Un nouveau resto, un nouveau studio yoga, un nouveau salon de coiffure — la zone de
        chalandise est ton 1 km de rayon. Un flyer hyper-ciblé (avec ton heure d&apos;ouverture
        + offre de lancement + code promo unique pour tracker) bat de loin n&apos;importe
        quelle pub digitale en CPA (coût par acquisition).
      </p>

      <h3>2. Événement à date fixe</h3>
      <p>
        Soirée portes ouvertes, vente d&apos;entrepôt, festival, brunch dominical
        spécial — l&apos;objet physique aide à la planification. Les gens collent le flyer
        sur leur frigo. L&apos;équivalent digital (event Facebook) est saturé de notifications
        et facilement oublié.
      </p>

      <h3>3. Service récurrent à fidélité courte</h3>
      <p>
        Nettoyage à sec, déneigement, taillage de haie, tonte de gazon — tous ces services
        ont besoin d&apos;un appel d&apos;action saisonnier répété. Un flyer dans la boîte
        aux lettres au bon moment (printemps pour la pelouse, novembre pour le déneigement)
        marche mieux que n&apos;importe quelle pub évergreen.
      </p>

      <h3>4. Upsell physique en commerce</h3>
      <p>
        Si tu as déjà du trafic en magasin, un flyer/dépliant qui présente tes services
        annexes (cours, ateliers, abonnement fidélité) génère un revenu par client en
        plus, sans coût d&apos;acquisition.
      </p>

      <h2>Format et design : les règles d&apos;or</h2>

      <h3>Format recommandé</h3>
      <p>
        <strong>4,25 × 5,5 pouces (carte postale)</strong> ou <strong>5,5 × 8,5 pouces
        (demi-lettre)</strong> pour la distribution boîtes aux lettres. Plus grand
        = plus de coûts de production + plus de risques que le flyer soit jeté avant
        d&apos;être lu (« encombrant »).
      </p>
      <p>
        Pour la distribution en magasin / comptoir, le <strong>format carte de visite</strong>
        marche aussi (les gens en gardent dans leur portefeuille).
      </p>

      <h3>Papier : 100lb gloss ou 14pt UV</h3>
      <p>
        Plus le papier est solide, plus le flyer survit au transit dans une boîte aux
        lettres. Le 14pt UV (notre stock standard cartes) marche très bien pour les flyers
        format postal — c&apos;est rigide, brillant, premium au toucher.
      </p>

      <h3>Hiérarchie visuelle</h3>
      <p>
        Règle de 3 secondes : si quelqu&apos;un regarde ton flyer 3 secondes et n&apos;a
        rien compris, c&apos;est foutu. Pour passer ce test :
      </p>
      <ul>
        <li><strong>UN headline géant</strong> (qui es-tu + qu&apos;est-ce que tu offres)</li>
        <li><strong>UNE offre claire</strong> (pas 3 offres mélangées)</li>
        <li><strong>UN call to action</strong> (téléphone, URL courte, QR code)</li>
        <li>Tout le reste = secondaire</li>
      </ul>

      <h2>Quantités typiques par campagne</h2>
      <ul>
        <li><strong>Distribution magasin (sur place)</strong> : 250-500 flyers, ré-approvisionnement aux 2 mois</li>
        <li><strong>Distribution rue / événement</strong> : 1 000 - 2 500 par jour de distribution</li>
        <li><strong>Postage boîtes aux lettres (1 km²)</strong> : 2 500 - 5 000 selon densité</li>
        <li><strong>Distribution Postes Canada (Toutes Résidences)</strong> : 5 000 - 25 000 selon code postal</li>
      </ul>

      <h2>Comment tracker l&apos;efficacité</h2>
      <p>
        Le flyer a la réputation de ne pas être trackable. C&apos;est faux — il suffit de
        l&apos;équiper :
      </p>
      <ol>
        <li><strong>Code promo unique</strong> imprimé sur le flyer (ex: &laquo; FLYER10 &raquo;)</li>
        <li><strong>URL courte trackée</strong> (bit.ly ou un sous-domaine type promo.tonsite.com)</li>
        <li><strong>QR code généré avec UTM params</strong> qui pointe vers une landing page dédiée — Google Analytics t&apos;indique exactement combien de scans</li>
        <li><strong>Numéro de téléphone dédié</strong> (CallRail, ServiceWhale) — chaque appel reçu sur ce numéro est attribué au flyer</li>
      </ol>

      <p className="blog-cta">
        <strong>On imprime tes flyers ?</strong> Devis instantané sur le wizard — choisis
        ton format (5,5 × 8,5 ou autre), ton papier, ta quantité, vois le prix changer en
        temps réel. <a href="/order/start">Démarrer un devis →</a>
      </p>
    </>
  );
}
