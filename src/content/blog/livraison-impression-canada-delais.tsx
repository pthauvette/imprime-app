/**
 * Article : délais réalistes de livraison impression au Canada.
 *
 * Cible SEO : "délai livraison impression Canada", "combien temps imprimer cartes",
 * "impression express Montréal". Pratique, factuel.
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'delais-livraison-impression-canada',
  title: 'Délais d\'impression au Canada : à quoi t\'attendre vraiment',
  excerpt: 'Standard 4-7 jours, rush 24-48 h, livraison Postes Canada vs UPS — démêle ce qui est réaliste vs ce que les imprimeurs promettent sans tenir.',
  date: '2026-04-12',
  author: 'Équipe Plio',
  tags: ['guide', 'livraison', 'logistique'],
  readingMinutes: 5,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        &laquo; 24-48 heures &raquo;, &laquo; livré demain &raquo;, &laquo; en 1 jour
        ouvrable &raquo; — les promesses des imprimeurs en ligne ressemblent souvent à du
        marketing optimiste. Voici les vrais délais que tu devrais planifier pour ne
        jamais être pris de court.
      </p>

      <h2>Décomposition d&apos;un délai d&apos;impression</h2>
      <p>
        Quand un imprimeur te dit &laquo; livré en 5 jours &raquo;, ce délai cache 3 étapes
        distinctes :
      </p>
      <ol>
        <li>
          <strong>Production (1-3 jours)</strong> — le temps que ton fichier passe par la
          prépresse, la presse et la finition (coating, découpe, lamination).
        </li>
        <li>
          <strong>Transit transporteur (1-5 jours)</strong> — le temps que le colis voyage
          de l&apos;usine à ta porte. Dépend du transporteur et de la distance.
        </li>
        <li>
          <strong>Buffer entre les deux (souvent ignoré)</strong> — manutention,
          étiquetage, ramassage par le transporteur, qui peut ajouter 0,5 à 1 jour.
        </li>
      </ol>

      <h2>Standard chez Plio : 4-7 jours ouvrables</h2>
      <p>
        Voici notre breakdown réel pour une commande standard (sans rush) avec UPS Standard :
      </p>
      <ul>
        <li><strong>Jour 0</strong> — tu passes commande</li>
        <li><strong>Jour 1-2</strong> — production (selon volume jour, parfois 1 jour seulement)</li>
        <li><strong>Jour 3</strong> — ramassage UPS</li>
        <li><strong>Jour 4-7</strong> — transit selon ta province (voir tableau ci-dessous)</li>
      </ul>

      <h2>Transit UPS par province (depuis l&apos;Ontario)</h2>
      <table>
        <thead>
          <tr>
            <th>Destination</th>
            <th>UPS Standard</th>
            <th>UPS Express</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Québec (sud)</td><td>1-2 jours</td><td>Jour suivant</td></tr>
          <tr><td>Ontario</td><td>1 jour</td><td>Jour suivant</td></tr>
          <tr><td>Maritimes (NB, NS, PE)</td><td>2-3 jours</td><td>1-2 jours</td></tr>
          <tr><td>Manitoba / Saskatchewan</td><td>2-3 jours</td><td>1-2 jours</td></tr>
          <tr><td>Alberta</td><td>3-4 jours</td><td>2 jours</td></tr>
          <tr><td>Colombie-Britannique</td><td>4-5 jours</td><td>2-3 jours</td></tr>
          <tr><td>Terre-Neuve</td><td>3-5 jours</td><td>2-3 jours</td></tr>
          <tr><td>Territoires (NT, NU, YT)</td><td>5-10 jours</td><td>3-5 jours</td></tr>
        </tbody>
      </table>

      <h2>Rush 24-48 h : quand c&apos;est possible</h2>
      <p>
        Le rush n&apos;est pas magique — c&apos;est juste un saut de file. Production
        accélérée + transit Express. Quand on l&apos;offre :
      </p>
      <ul>
        <li><strong>Commande passée avant 11h heure de l&apos;Est</strong> un jour ouvrable</li>
        <li><strong>Produit standard</strong> (pas un format custom, pas une finition spéciale type foil ou spot UV)</li>
        <li><strong>Fichier prepress-clean</strong> (sinon le validateur bloque et tu perds le créneau de production)</li>
      </ul>
      <p>
        Si une de ces conditions n&apos;est pas remplie, le rush devient impossible. On
        préfère te dire honnêtement plutôt que de promettre et de te livrer en retard.
      </p>

      <h2>Postes Canada vs UPS / FedEx</h2>
      <p>
        Pour les commandes &lt; 500 g (typique cartes de visite), <strong>Postes Canada</strong>
        est souvent plus économique :
      </p>
      <ul>
        <li><strong>+:</strong> moins cher, livraison à domicile partout au Canada (même en région), boîte aux lettres</li>
        <li><strong>−:</strong> plus lent (5-10 jours selon distance), pas de tracking précis, livraisons grévées parfois</li>
      </ul>
      <p>
        Pour les commandes &gt; 1 kg ou urgentes, <strong>UPS / FedEx</strong> :
      </p>
      <ul>
        <li><strong>+:</strong> plus rapide (1-5 jours), tracking précis avec ETA, signature à la livraison</li>
        <li><strong>−:</strong> plus cher, frais de zone éloignée pour certains codes postaux ruraux</li>
      </ul>

      <h2>Délai d&apos;impression vs date de réception</h2>
      <p>
        Quand on dit &laquo; 4-7 jours &raquo;, on parle de jours ouvrables, pas de jours
        calendaires. Si tu commandes vendredi soir :
      </p>
      <ul>
        <li>Production commence lundi</li>
        <li>Expédition mardi-mercredi</li>
        <li>Livraison fin de semaine suivante</li>
      </ul>
      <p>
        Donc concrètement, environ <strong>9-12 jours calendaires</strong>. Si tu as une
        deadline ferme, commande au moins 10 jours avant.
      </p>

      <h2>Conseil pratique</h2>
      <p>
        Quand tu lances une campagne (carte de vœux pour un client, flyers événement),
        configure et confirme ton devis AVANT la deadline finale. Le prix est figé dès
        la validation, donc tu sais exactement à quoi t&apos;attendre sans mauvaise
        surprise de dernière minute.
      </p>

      <p className="blog-cta">
        <strong>Prêt à lancer ta commande ?</strong> Devis instantané, prix transparent,
        livraison partout au Canada. <a href="/order/start">Configurer mon produit →</a>
      </p>
    </>
  );
}
