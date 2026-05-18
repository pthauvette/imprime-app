/**
 * Article : cohérence de marque sur les imprimés.
 * Cible SEO : "cohérence marque print", "brand guidelines impression".
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'coherence-marque-imprimes-brand-guidelines',
  title: 'Cohérence de marque sur tes imprimés : 7 règles que les agences gardent secrètes',
  excerpt: 'Pourquoi une marque pro a 10 % plus de conversion qu\'une marque amateur — et comment garder le même standard sur cartes, flyers, brochures.',
  date: '2026-03-05',
  author: 'Équipe Plio',
  tags: ['guide', 'branding', 'design'],
  readingMinutes: 6,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        Une marque incohérente coûte cher. Étude Lucidpress (2019) : les marques avec
        identité visuelle cohérente génèrent en moyenne 23 % de revenu en plus que les
        marques avec exécution inconsistante. C&apos;est pas le design qui vend — c&apos;est
        la <em>répétition</em> du même design qui crée la reconnaissance.
      </p>

      <h2>Pourquoi la cohérence compte</h2>
      <p>
        Quand un prospect voit ton logo 5 fois (carte de visite reçue + email signature +
        flyer dans une expo + post Instagram + facture), c&apos;est 5× le même message qui
        s&apos;ancre dans sa mémoire. Si chaque exposition montre un visuel différent, tu
        repars à zéro chaque fois.
      </p>
      <p>
        Les agences appliquent une discipline strict sur 7 dimensions visuelles. Voici la
        version condensée que tu peux appliquer toi-même.
      </p>

      <h2>1. Une seule version de ton logo</h2>
      <p>
        Pas &laquo; une pour fond clair, une pour fond foncé, une pour Instagram, une
        version avec slogan, une sans slogan &raquo;. Une. Si tu as besoin de variations,
        documente-les comme variations approuvées d&apos;un même logo, pas comme
        alternatives.
      </p>
      <p>
        <strong>En pratique :</strong> exporte 1 SVG vectoriel principal + 2 variations
        explicites (monochrome blanc, monochrome noir). C&apos;est tout. Sur tes imprimés
        Plio, choisis lequel selon le fond.
      </p>

      <h2>2. Palette de couleurs en CMYK ET en HEX</h2>
      <p>
        Tes couleurs primaires existent dans 2 mondes : digital (HEX / RGB) et print
        (CMYK). Les valeurs ne sont jamais 100 % identiques — un #1F3D2B web sort
        légèrement différent en CMYK selon la presse.
      </p>
      <p>
        <strong>En pratique :</strong> dans ton brand guide, note les 2 valeurs pour
        chaque couleur. Exemple : &laquo; Vert Plio = #1F3D2B web, C 60 M 0 Y 60 K 60
        print &raquo;. Quand tu prépares un fichier d&apos;impression, utilise la valeur
        CMYK directement.
      </p>

      <h2>3. Maximum 2 polices</h2>
      <p>
        Une pour les titres (display), une pour le corps de texte (body). Ajouter une
        troisième dilue ta personnalité visuelle. Si une 3e est nécessaire (pour
        l&apos;italique d&apos;une display sans italique native), c&apos;est une
        exception documentée.
      </p>
      <p>
        <strong>En pratique :</strong> sur tes imprimés Plio, garde la même paire
        Display + Body que sur ton site. Si ton site utilise Inter + Instrument Serif,
        tes flyers doivent aussi.
      </p>

      <h2>4. Un système de grilles répété</h2>
      <p>
        Une grille définit où vont les éléments. Si ton logo est toujours en haut à
        gauche à 32px de la marge, le cerveau du lecteur sait où le chercher la 2e fois.
        Ça libère son attention pour ton message au lieu de chercher où regarder.
      </p>
      <p>
        <strong>En pratique :</strong> sur tous tes imprimés, place le logo + le bloc
        coordonnées au même endroit relatif. Cartes : logo haut-gauche, info haut-droite.
        Flyers : logo en bas-droite, hero centré. Brochures : logo couverture seule,
        signature pages intérieures.
      </p>

      <h2>5. Photographie unifiée (ou pas du tout)</h2>
      <p>
        Si tu utilises des photos, qu&apos;elles aient toutes le même style — lumière
        naturelle vs studio, palette colorée vs désaturée, gens vs objets, gros plan vs
        large. Mélanger des stocks Shutterstock variés défait toute la cohérence.
      </p>
      <p>
        Si tu ne peux pas garantir un style cohérent : pas de photos, focus sur la
        typographie + couleurs + illustrations vectorielles. Beaucoup de marques
        modernes (Stripe, Linear, Notion) n&apos;utilisent presque pas de photos
        précisément pour cette raison.
      </p>

      <h2>6. Un ton de voix défini</h2>
      <p>
        Pas juste le visuel — le texte aussi. Es-tu formel ou casual ? Tutoyer ou
        vouvoyer ? Émojis ou pas ? Anglicismes acceptés ou pas ?
      </p>
      <p>
        <strong>Test :</strong> écris une phrase dans 3 contextes (carte de visite, email
        marketing, message d&apos;erreur). Si elles ne sonnent pas comme la même marque,
        tu n&apos;as pas de ton défini. Choisis-en un et documente-le.
      </p>

      <h2>7. Un standard d&apos;exécution print</h2>
      <p>
        Spécifie ton standard print dans ton brand guide :
      </p>
      <ul>
        <li>Papier par défaut (ex: &laquo; 16pt mat pour tout sauf événements spéciaux &raquo;)</li>
        <li>Finition (ex: &laquo; pas de UV brillant — incompatible avec notre ton mat &raquo;)</li>
        <li>Format des cartes de visite (3,5×2 standard ou 2,5×2,5 carré)</li>
        <li>Fournisseur préféré (te re-prendra moins de temps de gestion)</li>
      </ul>
      <p>
        Avoir ce standard évite que chaque nouveau besoin print devienne une mini-décision
        de design.
      </p>

      <h2>L&apos;outil : un brand guide PDF de 5 pages</h2>
      <p>
        Tu n&apos;as pas besoin d&apos;un manuel de 50 pages comme Coca-Cola. 5 pages
        suffisent pour 95 % des marques :
      </p>
      <ol>
        <li>Logo + variations + tailles minimum + clear space</li>
        <li>Palette couleurs (HEX + CMYK + Pantone si pertinent)</li>
        <li>Typographie (display + body + tailles d&apos;échelle)</li>
        <li>Photographie / illustration style + exemples</li>
        <li>Ton de voix + 3 exemples d&apos;application</li>
      </ol>
      <p>
        Documente-le une fois. Partage-le avec ton agence, freelance, fournisseur d&apos;impression.
        Plus jamais de doute sur ce que ta marque doit ressembler.
      </p>

      <p className="blog-cta">
        <strong>Commande tes imprimés cohérents :</strong> upload ton PDF brand-conforme,
        notre validateur vérifie automatiquement bleed + CMYK + résolution. <a href="/order/start">Démarrer →</a>
      </p>
    </>
  );
}
