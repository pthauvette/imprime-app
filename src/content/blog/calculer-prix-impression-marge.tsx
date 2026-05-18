/**
 * Article : calculer son prix de revente print pour designer / agence.
 * Cible SEO : "prix print designer", "marge revente impression".
 */

import type { PostMeta } from '@/lib/blog/posts';

export const meta: PostMeta = {
  slug: 'calculer-prix-revente-print-designer-agence',
  title: 'Designer / agence : comment calculer ton prix de revente print',
  excerpt: 'Tu commandes à 100 $, tu factures combien ? Méthode simple en 3 étapes pour pricer sans laisser d\'argent sur la table.',
  date: '2026-02-25',
  author: 'Équipe Plio',
  tags: ['guide', 'business', 'pricing'],
  readingMinutes: 5,
};

export default function Post() {
  return (
    <>
      <p className="blog-lede">
        Si tu es designer freelance ou petite agence, tu commandes le print chez un
        fournisseur (nous, idéalement 😉) puis tu le factures à ton client. La question
        revient toujours : <em>combien tu mark-up ?</em> Voici la méthode qu&apos;on voit
        marcher chez nos resellers.
      </p>

      <h2>3 modèles de pricing</h2>

      <h3>1. Pass-through + frais fixe (transparent)</h3>
      <p>
        Tu factures le coût réel + un frais de coordination (50-150 $ selon ton temps).
        Honnête, simple à expliquer, ne te rapporte pas grand-chose si la commande est
        petite.
      </p>
      <p>
        <strong>Quand utiliser :</strong> client qui est déjà sensibilisé aux coûts
        print, transparence est un atout. Risque : client te court-circuite la prochaine
        fois (&laquo; il commande direct chez Plio &raquo;).
      </p>

      <h3>2. Mark-up percentage (le plus commun)</h3>
      <p>
        Tu factures le coût × (1 + ta marge). Marge typique dans l&apos;industrie :
        <strong> 25-40 %</strong>. Au-dessus de 50 % devient suspect si le client compare.
      </p>
      <p>
        <strong>Exemple :</strong> tu commandes 500 cartes à 89 $ chez Plio. Tu factures
        ton client 89 × 1.35 = <strong>120 $</strong>. Ta marge brute : 31 $ pour ~15
        min de coordination. ROI : ~120 $/h équivalent.
      </p>

      <h3>3. Prix fixe par catégorie (productized)</h3>
      <p>
        Tu publies un tarif fixe par type de commande, sans détailler le coût sous-jacent.
        Le client voit un prix unique. Tu absorbes la variabilité (parfois tu gagnes
        plus, parfois moins).
      </p>
      <p>
        <strong>Exemple :</strong> &laquo; Pack identité visuelle imprimée : 750 $
        (incluant 500 cartes, 100 enveloppes, 100 letterheads) &raquo;. Coût réel chez
        Plio : ~280 $. Marge brute : 470 $ pour le package + livraison.
      </p>
      <p>
        <strong>Quand utiliser :</strong> tu veux scaling — clients qui choisissent un
        package sans négocier. Risque : tu peux perdre si le client demande des
        modifications imprévues.
      </p>

      <h2>La math du break-even</h2>
      <p>
        Combien de temps tu peux te permettre de passer sur une commande print pour
        qu&apos;elle soit profitable ? Dépend de ton taux horaire cible.
      </p>
      <p>
        Si tu veux gagner <strong>100 $/h</strong> (raisonnable pour designer junior à
        intermediate à Montréal), et que ta marge brute sur une commande est 30 $, alors
        tu ne dois pas passer plus de <strong>18 minutes</strong> dessus.
      </p>
      <p>
        Réalité : la 1ère commande prend 1-2 h (négociation, validation fichier, suivi).
        Les suivantes pour le même client : 15-30 min. C&apos;est pourquoi <strong>retenir
        ton client</strong> est plus important que maximiser la marge d&apos;une seule
        commande.
      </p>

      <h2>Quand monter ta marge</h2>
      <ul>
        <li>
          <strong>Rush 24h</strong> — tu absorbes le stress de la deadline, mark-up
          jusqu&apos;à 50-60 %.
        </li>
        <li>
          <strong>Validation prepress complexe</strong> — fichier client problématique,
          plusieurs revisions, mark-up 40-50 %.
        </li>
        <li>
          <strong>Gros volume avec design custom</strong> — tu prends le risque de
          gestion, mark-up + frais de design séparé.
        </li>
        <li>
          <strong>Client qui paie tard</strong> — ajoute 10-15 % pour compenser le
          floating de cashflow.
        </li>
      </ul>

      <h2>Quand baisser ta marge</h2>
      <ul>
        <li>
          <strong>Client récurrent gros volume</strong> — fidéliser vaut plus que
          maximiser un order. Mark-up 15-20 % suffit.
        </li>
        <li>
          <strong>Commande triviale (250 cartes standard)</strong> — le client peut
          comparer facilement online, garde-toi sous 30 % pour rester compétitif.
        </li>
        <li>
          <strong>Lead source de nouveaux clients</strong> — la 1ère commande est un
          investissement.
        </li>
      </ul>

      <h2>Le compte reseller Plio</h2>
      <p>
        Si tu fais ça souvent, postule au <a href="/reseller">programme reseller</a>.
        Tu obtiens le tarif wholesale + blind shipping (le colis arrive chez ton client
        sans logo Plio). Tu factures à ton tarif retail, tu paies au wholesale, la marge
        te revient en entier.
      </p>
      <p>
        Validation gratuite sous 1-2 jours ouvrables, pas de frais d&apos;adhésion, pas
        de minimum.
      </p>

      <p className="blog-cta">
        <strong>Postuler au programme reseller :</strong> formulaire 3 min, validation
        rapide, accès au tarif wholesale + blind shipping. <a href="/reseller">Postuler →</a>
      </p>
    </>
  );
}
