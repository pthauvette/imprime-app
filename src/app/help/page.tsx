/**
 * /help — centre d'aide / FAQ public.
 *
 * Server Component qui rend la FAQ organisée par catégorie. Le filtre/
 * recherche est un Client Component (HelpSearch) qui filtre côté client
 * sans network call (Q&A en mémoire).
 *
 * Pas de CMS — pour ajouter une Q&A : éditer FAQ array ci-dessous.
 * Quand le volume justifie un CMS, migrer vers MDX-style comme le blog.
 *
 * JSON-LD FAQPage pour rich snippets Google (afficher les Q&A directement
 * dans les SERPs).
 */

import Link from 'next/link';
import type { Route } from 'next';
import HelpSearch, { type FaqItem } from './HelpSearch';
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd';

export const metadata = {
  title: 'Centre d\'aide — Plio',
  description: 'Réponses aux questions fréquentes : commande, fichiers PDF, livraison, paiement, retour, échantillons. Support FR/EN, réponse sous 2 h ouvrables.',
};

const FAQ: FaqItem[] = [
  // ─── Commande ─────────────────────────────────────────────────────────
  {
    category: 'Commande',
    q: 'Comment passer ma première commande ?',
    a: 'Va sur le wizard de commande, choisis ton produit, configure (papier, format, finition), choisis la quantité, téléverse ton PDF et paie. Compte ~5 minutes du début à la fin si ton fichier est prêt.',
  },
  {
    category: 'Commande',
    q: 'Puis-je commander sans créer de compte ?',
    a: 'Oui. On crée automatiquement un compte avec ton email à la fin du checkout. Tu reçois un magic link pour te connecter quand tu veux voir ta commande ou en passer une nouvelle.',
  },
  {
    category: 'Commande',
    q: 'Puis-je modifier ma commande après le paiement ?',
    a: 'Avant qu\'on transmette à la presse (généralement dans l\'heure suivant le paiement), oui — écris-nous à bonjour@plio.ca avec ton numéro de commande. Après transmission à la presse, la modification n\'est plus possible.',
  },
  {
    category: 'Commande',
    q: 'Puis-je annuler ma commande ?',
    a: 'Avant transmission à la presse (1 h après paiement), oui — refund complet automatique. Après, ça dépend du status : si toujours en production, refund partiel possible ; si déjà imprimée ou expédiée, pas de refund (la fabrication est faite).',
  },

  // ─── Fichiers ─────────────────────────────────────────────────────────
  {
    category: 'Fichiers',
    q: 'Quel format de fichier acceptez-vous ?',
    a: 'PDF est le format recommandé (PDF/X-4 idéal). On accepte aussi AI (Illustrator) et PSD (Photoshop). Évite les JPG/PNG pour la qualité d\'impression sauf si tu sais ce que tu fais (300 DPI minimum).',
  },
  {
    category: 'Fichiers',
    q: 'Mon fichier doit-il être en CMYK ou RGB ?',
    a: 'CMYK pour des couleurs prévisibles à l\'impression. Si tu envoies du RGB, on convertit automatiquement, mais les couleurs peuvent légèrement varier de ce que tu vois à l\'écran. Notre guide complet : voir notre article blog "Préparer ton fichier PDF pour l\'impression".',
  },
  {
    category: 'Fichiers',
    q: 'Combien de bleed (fond perdu) je dois prévoir ?',
    a: '3 mm sur les 4 côtés. Notre validateur upload te dit si tu en manques. Si tu utilises un de nos templates, le bleed est déjà placé correctement.',
  },
  {
    category: 'Fichiers',
    q: 'Mon fichier a été refusé — que faire ?',
    a: 'Notre validateur upload te dit précisément ce qui cloche (résolution trop basse, CMYK manquant, polices non-embarquées, etc.). Corrige le fichier et re-upload — pas besoin de re-payer.',
  },

  // ─── Livraison ────────────────────────────────────────────────────────
  {
    category: 'Livraison',
    q: 'Combien de temps pour recevoir ma commande ?',
    a: 'Standard : 4-7 jours ouvrables (1-3 j production + 1-5 j transit selon ta province). Rush 24-48 h disponible sur certains produits standards si tu commandes avant 11 h heure de l\'Est.',
  },
  {
    category: 'Livraison',
    q: 'Vous livrez partout au Canada ?',
    a: 'Oui — UPS Standard et Postes Canada disponibles partout, incluant les territoires (avec délais étendus). Pas de livraison hors Canada pour MVP.',
  },
  {
    category: 'Livraison',
    q: 'Puis-je suivre ma commande ?',
    a: 'Oui. Tu reçois un email avec le numéro de tracking dès l\'expédition. Tu peux aussi consulter le status à tout moment sur /orders ou /track (sans login pour les guests).',
  },
  {
    category: 'Livraison',
    q: 'Que se passe-t-il si ma commande arrive endommagée ?',
    a: 'Écris-nous avec une photo du colis + du produit endommagé dans les 7 jours. On réimprime sans frais. C\'est rare (UPS/Postes Canada sont fiables) mais on couvre.',
  },

  // ─── Paiement ─────────────────────────────────────────────────────────
  {
    category: 'Paiement',
    q: 'Quels moyens de paiement acceptez-vous ?',
    a: 'Toutes les cartes de crédit / débit (Visa, MasterCard, AMEX) via Stripe. Apple Pay et Google Pay aussi disponibles sur mobile. Pas de virement bancaire pour MVP.',
  },
  {
    category: 'Paiement',
    q: 'Recevrai-je une facture ?',
    a: 'Oui — facture PDF avec TPS/TVQ détaillées disponible immédiatement après le paiement dans ton espace /orders. Tous les champs requis pour réclamer tes CTI/RTI sont présents (numéro TPS et TVQ de Plio).',
  },
  {
    category: 'Paiement',
    q: 'Mon paiement a échoué — pourquoi ?',
    a: 'Le plus souvent : carte refusée par la banque (limite, fraud detection, fonds insuffisants) ou 3D Secure rejeté. Ton panier est conservé — tu peux retourner au checkout et essayer une autre carte sans re-uploader ton fichier.',
  },

  // ─── Compte ───────────────────────────────────────────────────────────
  {
    category: 'Compte',
    q: 'Comment me connecter ?',
    a: 'Magic link : tape ton email sur /sign-in, on t\'envoie un lien de connexion par email. Pas de mot de passe à mémoriser. Le lien expire après 1 h pour la sécurité.',
  },
  {
    category: 'Compte',
    q: 'Comment changer mes préférences email ?',
    a: 'Va dans /settings → Préférences email. Tu peux désactiver les notifications de livraison (expédié, livré) tout en gardant les emails transactionnels obligatoires (confirmation de commande, refund, etc.) qu\'on doit envoyer par loi.',
  },
  {
    category: 'Compte',
    q: 'Comment voir mes commandes précédentes ?',
    a: 'Va sur /orders. Tu peux re-commander d\'un clic n\'importe quelle commande passée (le wizard pré-remplit toutes les options) — pratique pour les commandes récurrentes.',
  },

  // ─── Échantillons ─────────────────────────────────────────────────────
  {
    category: 'Échantillons',
    q: 'Les échantillons sont vraiment gratuits ?',
    a: 'Oui. Tu peux commander jusqu\'à 5 échantillons gratuits par mois (papiers + finitions) — livrés par Postes Canada en 5 jours. Pas de carte de crédit demandée, pas d\'abonnement. C\'est notre way d\'aider tu choisir avant d\'engager du volume.',
  },
  {
    category: 'Échantillons',
    q: 'Combien de samples puis-je demander par mois ?',
    a: 'Maximum 5 par mois par email. Si tu as besoin de plus pour un projet spécifique, écris-nous — on accommode au cas par cas (designer en sourcing pour un client, etc.).',
  },

  // ─── Parrainage ───────────────────────────────────────────────────────
  {
    category: 'Parrainage',
    q: 'Comment marche le programme de parrainage ?',
    a: 'Tu as un code unique dans /account/referrals. Partage-le. Quand un ami passe sa première commande payée avec ton code, vous recevez chacun 10 $ CAD de crédit appliqué automatiquement à votre prochain checkout.',
  },
  {
    category: 'Parrainage',
    q: 'Y a-t-il une limite au nombre de parrainages ?',
    a: 'Aucune limite — plus tu parraines, plus tu accumules de crédit. Le crédit n\'expire pas. Anti-abuse : un user ne peut être filleul qu\'une seule fois (premier parrain qui amène l\'inscription gagne).',
  },
];

export default function HelpPage() {
  // JSON-LD FAQPage — Google peut afficher les questions directement
  // dans les résultats de recherche. Énorme boost de visibilité SERP.
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  return (
    <>
      <JsonLd data={faqSchema} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Accueil', path: '/' },
          { name: 'Centre d\'aide', path: '/help' },
        ])}
      />

      <nav className="mkt-nav">
        <Link href={'/' as Route} className="mkt-brand">Plio.</Link>
        <div className="mkt-nav-links">
          <Link href={'/order/start' as Route} className="mkt-nav-link">Produits</Link>
          <Link href={'/blog' as Route} className="mkt-nav-link">Blog</Link>
          <Link href={'/help' as Route} className="mkt-nav-link active">Aide</Link>
          <Link href={'/contact' as Route} className="mkt-nav-link">Contact</Link>
          <Link href={'/order/start' as Route} className="mkt-nav-cta">Commander →</Link>
        </div>
      </nav>

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '64px 24px 96px' }}>
        <header style={{ marginBottom: 32 }}>
          <div className="page-eyebrow">Centre d&apos;aide</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 6vw, 56px)', letterSpacing: '-0.025em', fontWeight: 400, lineHeight: 1.05, margin: '8px 0 16px' }}>
            On peut <em style={{ color: 'var(--accent-primary)' }}>t&apos;aider ?</em>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 620, margin: 0, lineHeight: 1.55 }}>
            Réponses aux questions les plus fréquentes. Si tu ne trouves pas ta réponse,
            écris-nous à <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a> — réponse sous 2 h ouvrables.
          </p>
        </header>

        <HelpSearch items={FAQ} />

        {/* Contact CTA */}
        <section
          style={{
            marginTop: 56,
            padding: 28,
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--r-xl)',
            display: 'grid',
            gap: 14,
          }}
        >
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', margin: 0 }}>
            Toujours bloqué ?
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            On répond en moyenne sous 2 h ouvrables. Inclus avec ta commande, gratuit, illimité.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="mailto:bonjour@plio.ca" className="btn btn-primary">
              📧 bonjour@plio.ca
            </a>
            <Link href={'/contact' as Route} className="btn btn-ghost">
              Formulaire de contact →
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
