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
import HelpSearch from './HelpSearch';
import { FAQ_ITEMS, type FaqItem } from '@/data/help-faq';
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd';

export const metadata = {
  title: 'Centre d\'aide — Plio',
  description: 'Réponses aux questions fréquentes : commande, fichiers PDF, livraison, paiement, retour, échantillons. Support FR/EN, réponse sous 2 h ouvrables.',
};

export default function HelpPage() {
  // JSON-LD FAQPage — Google peut afficher les questions directement
  // dans les résultats de recherche. Énorme boost de visibilité SERP.
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item: FaqItem) => ({
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

        <HelpSearch items={FAQ_ITEMS} />

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
