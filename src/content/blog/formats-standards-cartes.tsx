/**
 * Article blog : formats standards de cartes de visite (CA, US, EU, JP).
 *
 * Cible SEO : "format carte de visite Canada", "dimensions carte de visite",
 * "carte de visite standard 3.5x2". Court (~600 mots), pédagogique.
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'formats-standards-cartes-de-visite-canada',
  title: 'Formats standards des cartes de visite : Canada, US, Europe, Japon',
  excerpt: 'Le 3,5×2 pouces domine en Amérique du Nord — mais d\'autres formats existent. Voici quand utiliser quoi et pourquoi.',
  date: '2026-05-05',
  author: 'Équipe Plio',
  tags: ['guide', 'cartes-de-visite', 'formats'],
  readingMinutes: 3,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        En Amérique du Nord, le format 3,5 × 2 pouces (89 × 51 mm) est devenu un standard
        de facto. Mais selon ton public ou ton marché, d&apos;autres formats peuvent mieux
        servir. Tour d&apos;horizon.
      </p>

      <h2>Le standard nord-américain : 3,5 × 2 pouces</h2>
      <p>
        <strong>Dimensions exactes :</strong> 88,9 × 50,8 mm.
      </p>
      <p>
        C&apos;est le format que tu reçois 95% du temps au Canada et aux États-Unis. Il
        rentre dans tous les porte-cartes standards, les rolodexes, les portefeuilles. Le
        ratio (1,75:1) est familier — ton design ne paraîtra pas étrange.
      </p>
      <p>
        <strong>Quand l&apos;utiliser :</strong> par défaut, sauf raison spécifique de
        diverger.
      </p>

      <h2>Le format européen : 85 × 55 mm</h2>
      <p>
        Légèrement plus carré (ratio 1,55:1), c&apos;est le standard ISO 7810 ID-1, identique
        à une carte de crédit. Plus large, moins long que le format nord-américain.
      </p>
      <p>
        <strong>Quand l&apos;utiliser :</strong> si ta clientèle est principalement
        européenne ou si tu veux signaler une sensibilité internationale. Aussi pratique si
        tu mets une photo plein cadre (le ratio se prête mieux au portrait).
      </p>

      <h2>Le format japonais : 91 × 55 mm</h2>
      <p>
        Au Japon, le <em>meishi</em> est presque sacré — protocole précis d&apos;échange,
        format codifié. Si tu fais affaire au Japon, prévoir des cartes au format local est
        un signe de respect très remarqué.
      </p>
      <p>
        <strong>Quand l&apos;utiliser :</strong> partenariats ou business trips au Japon
        seulement. Sinon le format paraîtra grand dans un porte-cartes nord-américain.
      </p>

      <h2>Formats spéciaux (non-standard)</h2>

      <h3>Carré 2,5 × 2,5 pouces</h3>
      <p>
        Format très utilisé par les designers, photographes, marques jeunes. Sort des
        porte-cartes traditionnels (ne rentre pas) — mais c&apos;est précisément ça
        l&apos;effet recherché : on la garde sur le bureau plutôt que dans une pile.
      </p>

      <h3>Format mini 3 × 1 pouces</h3>
      <p>
        Très tendance dans le tatouage et la mode. Plus longue et plus mince qu&apos;une
        carte standard. Coûte plus cher au pouce² mais l&apos;effet de surprise est
        notable.
      </p>

      <h3>Format pliant (folded)</h3>
      <p>
        Une carte qui s&apos;ouvre comme un mini-dépliant. Permet 4 panneaux d&apos;info.
        Useful pour les freelances avec beaucoup d&apos;offres ou les restaurants avec un
        menu condensé.
      </p>

      <h2>Marges et fond perdu (bleed)</h2>
      <p>
        Quelle que soit la dimension finale, ton fichier de fabrication doit inclure :
      </p>
      <ul>
        <li>
          <strong>Bleed (fond perdu) de 3 mm</strong> tout autour, pour que les fonds colorés
          atteignent le bord sans laisser de liseré blanc après la coupe.
        </li>
        <li>
          <strong>Safe zone (zone sûre) de 3 mm</strong> à l&apos;intérieur de la dimension
          finale, où placer le texte critique pour qu&apos;il ne soit pas coupé.
        </li>
      </ul>
      <p>
        Notre wizard upload vérifie ces deux contraintes automatiquement et t&apos;alerte
        si ton PDF ne les respecte pas — pas besoin d&apos;être designer pour livrer un
        fichier conforme.
      </p>

      <p className="blog-cta">
        <strong>Astuce :</strong> télécharge un de nos templates pré-formatés
        (3,5×2 standard, carré, mini) sur la page <a href="/templates">Templates</a> — tous
        les bleeds + zones sûres sont déjà placés.
      </p>
    </>
  );
}
