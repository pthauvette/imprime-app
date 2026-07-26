/**
 * Article blog : guide papier pour cartes de visite.
 *
 * Cible SEO : "quel papier choisir cartes de visite", "14pt vs 16pt vs 18pt",
 * "papier mat ou brillant cartes". Long-form (~1200 mots) pour ranker
 * sur les recherches intent comparatif.
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'comment-choisir-papier-cartes-de-visite',
  title: 'Quel papier choisir pour tes cartes de visite ? Le guide complet',
  excerpt: '14pt, 16pt, 18pt, soft touch, mat, brillant — décode chaque option pour faire le bon choix selon ton métier et ton budget.',
  date: '2026-05-15',
  author: 'Équipe Plio',
  tags: ['guide', 'cartes-de-visite', 'papier'],
  readingMinutes: 6,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        La carte de visite est souvent le premier objet physique que ton client touchera de
        ta marque. Le choix du papier ne change pas juste l&apos;esthétique — il définit la
        sensation, la durabilité et le message implicite sur ton positionnement. Voici
        comment décider sans regret.
      </p>

      <h2>Comprendre les épaisseurs</h2>
      <p>
        Les épaisseurs de papier sont mesurées en <strong>points (pt)</strong> ou en{' '}
        <strong>lbs</strong>. Plus le chiffre est élevé, plus la carte est rigide et premium.
        Voici les 3 standards qu&apos;on offre chez Plio :
      </p>

      <ul>
        <li>
          <strong>14pt (350 g/m²)</strong> — standard de l&apos;industrie. Solide, économique,
          c&apos;est le choix par défaut pour 80% des cartes commerciales. Ne se plie pas
          dans une poche mais reste flexible.
        </li>
        <li>
          <strong>16pt (400 g/m²)</strong> — sensation premium accessible. La différence avec
          le 14pt est nette dès qu&apos;on tient les deux côte à côte. Recommandé pour les
          consultants, designers, avocats — tous les métiers où l&apos;objet doit signaler
          du sérieux.
        </li>
        <li>
          <strong>18pt (450 g/m²)</strong> — la &laquo; carte de visite événement &raquo;. Très épais,
          mémorable. Souvent combiné avec du soft touch ou une finition spéciale pour
          maximiser l&apos;effet wow. Coût ~30% supérieur au 14pt.
        </li>
      </ul>

      <h2>Mat ou brillant ?</h2>
      <p>
        C&apos;est l&apos;autre décision majeure. La finition affecte la lisibilité, la
        photogénie et la sensation au toucher.
      </p>

      <h3>UV brillant</h3>
      <p>
        Le couchage UV donne un fini vitré qui fait éclater les couleurs. Excellent pour les
        photos, les logos colorés ou les marques jeunes. Inconvénient : difficile d&apos;écrire
        au stylo dessus, donc évite si tu veux y noter un rendez-vous.
      </p>

      <h3>Mat</h3>
      <p>
        Pas de couchage, le papier respire. La texture est plus sobre, plus &laquo; sophistiquée &raquo;
        — c&apos;est le choix de prédilection des avocats, comptables, architectes. Tu peux
        écrire dessus au stylo (bonus pour les rendez-vous improvisés).
      </p>

      <h3>Soft touch</h3>
      <p>
        La finition haut de gamme. Pellicule veloutée qui donne une sensation de peau de
        pêche. Coûte ~25% de plus que le mat mais l&apos;impression sur les gens est
        immédiate. Recommandé pour les marques premium et le luxe.
      </p>

      <h2>Notre recommandation par budget</h2>
      <ul>
        <li>
          <strong>Budget serré (~50$/250 cartes)</strong> : 14pt mat. C&apos;est le combo
          standard qui ne déçoit jamais.
        </li>
        <li>
          <strong>Milieu de gamme (~80$/250 cartes)</strong> : 16pt UV ou mat selon ton
          industrie. Le saut perceptuel par rapport au 14pt en vaut le coût.
        </li>
        <li>
          <strong>Premium (~120$/250 cartes)</strong> : 16pt soft touch. Tu vas obtenir des
          commentaires à chaque échange. Investissement marketing déguisé en carte de visite.
        </li>
      </ul>

      <h2>Erreurs courantes à éviter</h2>
      <ol>
        <li>
          <strong>Choisir 14pt brillant pour des textes denses.</strong> Le brillant fait
          briller la lumière et fatigue la lecture. Si ta carte a beaucoup de texte (info
          recto-verso, citations, etc.), va vers mat ou soft touch.
        </li>
        <li>
          <strong>Mélanger soft touch et impression dorée (foil).</strong> Le foil ne tient
          pas bien sur la pellicule soft touch — il faut choisir l&apos;une ou l&apos;autre.
        </li>
        <li>
          <strong>Commander 100 cartes &laquo; pour tester &raquo;.</strong> Le prix par unité chute
          drastiquement à partir de 250. Pour 30$ de plus tu auras 4× plus de cartes.
          Regarde notre calculateur de quantité dans le wizard.
        </li>
      </ol>

      <p className="blog-cta">
        <strong>Prêt à commander ?</strong> Notre wizard te montre le prix en temps réel
        pour chaque combinaison de papier + finition. Aucun engagement, configure et compare
        en 30 secondes.
      </p>
    </>
  );
}
