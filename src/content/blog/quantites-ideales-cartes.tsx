/**
 * Article blog : combien de cartes commander selon ton métier.
 *
 * Cible SEO : "combien de cartes de visite commander", "quantité cartes
 * professionnelles". Court (~700 mots), tableau utile, axé décision rapide.
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'quantites-ideales-cartes-de-visite',
  title: 'Combien de cartes de visite commander ? Le guide par métier',
  excerpt: 'Pas trop pour ne pas gaspiller si tu changes de poste, assez pour ne pas re-commander tous les 2 mois. Voici nos benchmarks.',
  date: '2026-05-10',
  author: 'Équipe Plio',
  tags: ['guide', 'cartes-de-visite', 'budget'],
  readingMinutes: 4,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        La question revient toujours : <em>combien de cartes je devrais commander ?</em> La
        réponse honnête : ça dépend du nombre de personnes que tu vas rencontrer dans les 6
        prochains mois. Voici nos benchmarks selon ton métier, plus la math du coût par unité.
      </p>

      <h2>Benchmarks par profil</h2>
      <table>
        <thead>
          <tr>
            <th>Profil</th>
            <th>Quantité recommandée</th>
            <th>Pourquoi</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Freelance / consultant solo</td>
            <td>250</td>
            <td>2-4 cartes par semaine en networking, ça dure 1-2 ans.</td>
          </tr>
          <tr>
            <td>Vendeur B2B sur le terrain</td>
            <td>500-1000</td>
            <td>10+ cartes/semaine, re-commande aux 6 mois.</td>
          </tr>
          <tr>
            <td>Designer / créatif</td>
            <td>500</td>
            <td>Plus visuel, gardé comme objet — les gens en gardent plus.</td>
          </tr>
          <tr>
            <td>Restaurateur / petit commerce</td>
            <td>1000-2500</td>
            <td>Bowl à l&apos;entrée, distribution passive haute.</td>
          </tr>
          <tr>
            <td>Avocat / comptable senior</td>
            <td>250</td>
            <td>Réseautage ciblé, peu d&apos;échanges spontanés.</td>
          </tr>
          <tr>
            <td>Événementiel / lancement</td>
            <td>2500-5000</td>
            <td>Distribution massive sur quelques jours.</td>
          </tr>
        </tbody>
      </table>

      <h2>La math du prix par unité</h2>
      <p>
        Notre tarification dégressive est agressive — plus tu commandes, moins tu paies par
        unité. Exemple en 14pt UV :
      </p>

      <ul>
        <li><strong>100 cartes</strong> : ~0,52 $/carte</li>
        <li><strong>250 cartes</strong> : ~0,28 $/carte (-46 %)</li>
        <li><strong>500 cartes</strong> : ~0,18 $/carte (-65 %)</li>
        <li><strong>1000 cartes</strong> : ~0,12 $/carte (-77 %)</li>
      </ul>

      <p>
        Conclusion : commander 100 cartes est presque jamais une bonne idée. Le coût fixe de
        setup (fichier, presse, livraison) est amorti sur le tirage, donc à très petit
        volume tu paies surtout du fixe.
      </p>

      <h2>Notre recommandation par défaut</h2>
      <p>
        Si tu hésites, prends <strong>500 cartes</strong>. C&apos;est le sweet spot entre
        prix par unité et risque de stock (changement de poste, rebrand). Pour ~50 $
        de plus que 250, tu doubles ton stock.
      </p>

      <p>
        Et si tu changes vraiment de coordonnées entre temps : tu peux toujours redonner les
        anciennes à des fournisseurs/réseautage ponctuel, ou les utiliser comme &laquo; carte
        de remerciement &raquo; en ratifiant l&apos;ancien numéro. Le gaspillage réel est
        rare.
      </p>

      <p className="blog-cta">
        <strong>Configure ta commande maintenant.</strong> Le calculateur du wizard ajuste
        le prix en temps réel quand tu glisses la barre de quantité — tu verras
        instantanément la différence entre chaque palier.
      </p>
    </>
  );
}
