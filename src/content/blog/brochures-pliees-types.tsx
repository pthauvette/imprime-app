/**
 * Article : types de brochures pliées (bi-fold, tri-fold, z-fold, gate-fold).
 * Cible SEO : "types brochures pliées", "tri-fold vs bi-fold".
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'types-brochures-pliees-bi-tri-z-gate',
  title: 'Brochures pliées : bi-fold, tri-fold, z-fold, gate-fold — quand utiliser quoi',
  excerpt: 'Le pli détermine la lisibilité, le storytelling et la perception premium. Tour d\'horizon des 4 grands types de plis et leurs usages.',
  date: '2026-04-05',
  author: 'Équipe Plio',
  tags: ['guide', 'brochures', 'plis'],
  readingMinutes: 5,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        Une brochure dépliée à plat, c&apos;est un poster. La magie commence quand tu plies.
        Le pli structure le récit : ce qu&apos;on voit en premier, ce qui se révèle à la
        seconde, ce qui clôt l&apos;histoire. Voici les 4 grands plis et leurs use cases.
      </p>

      <h2>Bi-fold (pli en deux)</h2>
      <p>
        Le plus simple : une feuille pliée au milieu, donne 4 panneaux (recto + verso de
        chaque côté). Format typique : 8,5 × 11 plié à 5,5 × 8,5.
      </p>
      <p>
        <strong>Quand l&apos;utiliser :</strong> menus de resto, programmes de spectacle,
        bulletins paroissiaux, fiches techniques produits. Quand tu as 2 sujets à couvrir et
        que tu veux que les deux soient sur des panneaux distincts. Lisibilité facile.
      </p>
      <p>
        <strong>Évite :</strong> les contenus trop denses — chaque panneau doit respirer.
        Si tu as 6 sujets à couvrir, regarde tri-fold.
      </p>

      <h2>Tri-fold (pli en trois)</h2>
      <p>
        La feuille est divisée en 3 panneaux égaux, pliée comme une lettre. 6 panneaux au
        total (recto + verso). Format typique : 8,5 × 11 plié à 3,67 × 8,5.
      </p>
      <p>
        <strong>Quand l&apos;utiliser :</strong> brochures commerciales classiques, fiches
        services pro (médecin, comptable, agence immobilière), dépliants événements.
        L&apos;objet rentre dans une poche intérieure de veston ou une enveloppe #10
        standard.
      </p>
      <p>
        <strong>Subtilité :</strong> le panneau central du verso est ce qu&apos;on voit en
        ouvrant la première fois — c&apos;est ton hero. Le panneau extérieur droit
        (visible côté plié) est la couverture. Pense ces 2 panneaux en premier.
      </p>

      <h2>Z-fold (pli en accordéon)</h2>
      <p>
        Comme le tri-fold mais les plis vont en sens opposés (forme de Z). 6 panneaux mais
        chacun s&apos;ouvre indépendamment, créant un effet de révélation séquentielle.
      </p>
      <p>
        <strong>Quand l&apos;utiliser :</strong> storytelling chronologique (timeline,
        étapes d&apos;un processus), portfolios créatifs où chaque panneau présente une
        œuvre distincte, programmes de festival jour par jour. Le format est plus
        spectaculaire à l&apos;ouverture.
      </p>
      <p>
        <strong>Limitation :</strong> moins de surface continue — chaque panneau est isolé,
        difficile d&apos;y faire une grande photo qui traverse plusieurs panneaux.
      </p>

      <h2>Gate-fold (pli en portail)</h2>
      <p>
        Les 2 côtés se replient vers le centre, comme des portes qui s&apos;ouvrent sur une
        grande image révélée. Effet wow garanti.
      </p>
      <p>
        <strong>Quand l&apos;utiliser :</strong> annonces produits luxueux (parfumerie,
        bijouterie, hôtellerie haut de gamme), invitations événements premium, brochures
        immobilier de prestige. Le coup de théâtre justifie le coût supplémentaire (papier
        plus épais + pliage plus complexe = ~40 % plus cher qu&apos;un tri-fold).
      </p>
      <p>
        <strong>Note technique :</strong> les 2 volets extérieurs doivent faire chacun
        ~3 mm de moins que la moitié du panneau central, sinon ils ne ferment pas
        proprement. Notre validateur upload te le dit si ton fichier a mal calé.
      </p>

      <h2>Choisir selon ton message</h2>
      <ul>
        <li><strong>1-2 idées + format pocket</strong> → tri-fold</li>
        <li><strong>2 sujets bien distincts</strong> → bi-fold</li>
        <li><strong>Storytelling séquentiel (timeline)</strong> → z-fold</li>
        <li><strong>Effet premium avec révélation</strong> → gate-fold</li>
        <li><strong>Brochure technique 8+ pages</strong> → on sort du pli simple : booklet relié (autre catégorie produit)</li>
      </ul>

      <h2>Papier et grammage</h2>
      <p>
        Plus de plis = papier plus épais idéalement. Trop épais sans rainage (creasing
        pré-pli) et le pli craquelle. On recommande :
      </p>
      <ul>
        <li>Bi-fold simple : 100lb gloss text OK</li>
        <li>Tri-fold : 100lb gloss text OU 80lb gloss cover (mieux pour la rigidité)</li>
        <li>Z-fold : 80lb cover minimum, rainage recommandé</li>
        <li>Gate-fold : 100lb cover + rainage obligatoire (inclus dans nos rush gate-folds)</li>
      </ul>

      <p className="blog-cta">
        <strong>Configure ta brochure :</strong> le wizard Plio te montre le rendu plié
        en preview avant de payer. <a href="/order/start">Démarrer une brochure →</a>
      </p>
    </>
  );
}
