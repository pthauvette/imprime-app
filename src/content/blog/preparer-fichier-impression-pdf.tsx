/**
 * Article : checklist préparation fichier PDF pour impression.
 *
 * Cible SEO : "préparer fichier impression", "bleed cartes de visite",
 * "CMYK ou RGB impression", "DPI carte de visite". Long-form (~1000 mots).
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'preparer-fichier-pdf-impression-checklist',
  title: 'Préparer ton fichier PDF pour l\'impression : la checklist complète',
  excerpt: 'Bleed, safe zone, CMYK, 300 DPI, polices vectorisées — les 7 vérifications qui évitent les surprises à la livraison.',
  date: '2026-04-28',
  author: 'Équipe Plio',
  tags: ['guide', 'fichiers', 'pdf'],
  readingMinutes: 7,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        90% des problèmes d&apos;impression viennent du fichier source — pas de la presse. Un
        PDF bien préparé sort comme tu l&apos;as imaginé. Un PDF approximatif sort avec des
        bordures blanches, des couleurs ternes ou des polices remplacées. Voici la checklist
        qu&apos;on applique nous-mêmes avant chaque commande.
      </p>

      <h2>1. Format et dimensions exactes</h2>
      <p>
        Avant tout : ton document doit être <strong>au format final</strong> de ta carte,
        pas plus grand. Si tu fais des cartes 3,5 × 2 pouces, ton fichier doit faire 3,5 × 2
        pouces (pas une page de format A4 avec ta carte centrée dessus). La presse coupe
        toujours au format du fichier.
      </p>
      <p>
        <strong>Erreur classique :</strong> exporter un document Illustrator en A4 avec la
        carte dans un coin. La presse va imprimer la page entière puis essayer de la
        recadrer — résultat imprévisible.
      </p>

      <h2>2. Bleed (fond perdu) de 3 mm</h2>
      <p>
        Le bleed, c&apos;est l&apos;extension de ton design au-delà du format final, pour que
        si la coupe dévie de 0,5 mm, il n&apos;y ait pas de liseré blanc apparent.
      </p>
      <p>
        <strong>Comment l&apos;ajouter :</strong>
      </p>
      <ul>
        <li><strong>InDesign :</strong> Document Setup → Bleed → 3 mm (0,125&quot;) sur les 4 côtés. Au moment de l&apos;export PDF, coche &laquo; Use Document Bleed Settings &raquo;.</li>
        <li><strong>Illustrator :</strong> File → Document Setup → Bleed → 3 mm. À l&apos;export, &laquo; Use Document Bleed Settings &raquo;.</li>
        <li><strong>Photoshop :</strong> ajoute manuellement 6 mm à la largeur et hauteur du document (3 mm de chaque côté). Place tes éléments de fond pour qu&apos;ils s&apos;étendent dans cette zone.</li>
        <li><strong>Canva :</strong> coche &laquo; Crop marks and bleed &raquo; au moment du PDF download.</li>
      </ul>

      <h2>3. Safe zone (zone sûre) de 3 mm</h2>
      <p>
        L&apos;inverse du bleed : c&apos;est une marge intérieure où tu ne mets <strong>aucun
        texte ni élément critique</strong>. Si la coupe dévie, tu ne veux pas que ton
        numéro de téléphone soit coupé en deux.
      </p>
      <p>
        Règle simple : laisse au minimum 3 mm entre le bord de ton format final et tout
        texte / logo important. 5 mm si tu veux une zone confortable.
      </p>

      <h2>4. Mode couleur CMYK (pas RGB)</h2>
      <p>
        Les écrans utilisent <strong>RGB</strong> (rouge / vert / bleu, additif). Les
        presses utilisent <strong>CMYK</strong> (cyan / magenta / jaune / noir, soustractif).
        Convertir RGB → CMYK change toujours les couleurs un peu — les violets profonds, les
        oranges vifs, les verts éclatants sont les plus affectés.
      </p>
      <p>
        <strong>Convertis avant l&apos;export</strong> pour voir exactement ce que tu
        obtiendras :
      </p>
      <ul>
        <li><strong>InDesign / Illustrator :</strong> Edit → Convert to Profile → Coated FOGRA39 (Europe) ou US Web Coated SWOP v2 (Amérique du Nord).</li>
        <li><strong>Photoshop :</strong> Image → Mode → CMYK Color, puis Image → Adjustments → soft-proof.</li>
      </ul>
      <p>
        Si tu envoies un PDF RGB, on le convertit automatiquement — mais le résultat peut
        te surprendre. Mieux vaut maîtriser la conversion toi-même.
      </p>

      <h2>5. Résolution images : 300 DPI minimum</h2>
      <p>
        Une image affichée nette sur ton écran à 72 DPI sera floue imprimée. La règle
        universelle pour l&apos;impression de qualité :
      </p>
      <ul>
        <li><strong>300 DPI</strong> pour les images de qualité (logos, photos)</li>
        <li><strong>600 DPI</strong> pour les illustrations très détaillées ou les petits textes en image</li>
        <li><strong>Vector quand possible</strong> (SVG, Illustrator) — résolution infinie, jamais flou</li>
      </ul>
      <p>
        <strong>Test rapide :</strong> dans Photoshop, va dans Image → Image Size. Si la
        résolution est inférieure à 300 pixels/inch à ton format d&apos;impression, ton
        image va sortir floue. Re-source-la en haute résolution, ou réduis la taille
        d&apos;affichage dans ton design.
      </p>

      <h2>6. Polices vectorisées (outlined) ou embarquées</h2>
      <p>
        Si la presse n&apos;a pas la même police que toi sur leur serveur, elle sera
        remplacée par une substitution — généralement laide. Deux options pour éviter ça :
      </p>
      <ul>
        <li>
          <strong>Vectorise les polices (recommandé pour cartes de visite)</strong> :
          dans Illustrator / InDesign, sélectionne tout ton texte → Type → Create Outlines.
          Tes lettres deviennent des formes vectorielles, indépendantes de la police
          installée. Inconvénient : tu ne peux plus éditer le texte après.
        </li>
        <li>
          <strong>Embarquer les polices dans le PDF</strong> : à l&apos;export PDF, coche
          &laquo; Embed all fonts &raquo;. La police voyage avec le fichier. Pratique si tu
          veux re-utiliser le fichier pour faire des changements de dernière minute.
        </li>
      </ul>

      <h2>7. Format d&apos;export : PDF/X-1a ou PDF/X-4</h2>
      <p>
        Ce sont des préréglages PDF spécifiquement conçus pour l&apos;impression
        professionnelle :
      </p>
      <ul>
        <li><strong>PDF/X-1a :</strong> aplatit les transparences, CMYK only, polices embarquées. Le plus sûr, accepté partout.</li>
        <li><strong>PDF/X-4 :</strong> garde les transparences, permet RGB + CMYK. Plus moderne. Notre validateur préfère X-4.</li>
      </ul>
      <p>
        Évite &laquo; Smallest File Size &raquo; ou &laquo; High Quality Print &raquo; — ils
        compressent les images et causent souvent du bruit visible.
      </p>

      <h2>Le validateur Plio</h2>
      <p>
        Au moment de ton upload, notre wizard vérifie automatiquement chacun de ces 7
        points et te montre exactement ce qui cloche, avec des suggestions de fix. Pas
        besoin d&apos;être designer pro pour livrer un fichier conforme — l&apos;outil te
        guide.
      </p>

      <p className="blog-cta">
        <strong>Astuce :</strong> télécharge un de nos templates pré-formatés (bleed +
        safe zone + CMYK déjà configurés) depuis la page <a href="/templates">Templates</a>.
        Tu n&apos;as plus qu&apos;à ajouter ton contenu.
      </p>
    </>
  );
}
