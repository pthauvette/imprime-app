/**
 * /quote — landing pour demande de devis sur-mesure (hors catalogue).
 *
 * Server Component pour le contenu marketing + JSON-LD. Le form est un
 * Client Component (QuoteRequestForm) qui POST /api/quote/request.
 *
 * Use case : quand le wizard standard ne couvre pas (grande quantité,
 * papier custom, finitions spéciales, packaging, signage, kit assemblé).
 */

import Link from 'next/link';
import type { Route } from 'next';
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd';
import QuoteRequestForm from './QuoteRequestForm';

export const metadata = {
  title: 'Devis sur-mesure — Plio',
  description: 'Un projet d\'impression hors catalogue ? Grande quantité, papier spécifique, finition unique, signage, packaging — on te quote sous 1-2 jours ouvrables.',
};

export default function QuotePage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Accueil', path: '/' },
          { name: 'Devis sur-mesure', path: '/quote' },
        ])}
      />

      <nav className="mkt-nav">
        <Link href={'/' as Route} className="mkt-brand">Plio.</Link>
        <div className="mkt-nav-links">
          <Link href={'/order/start' as Route} className="mkt-nav-link">Produits</Link>
          <Link href={'/blog' as Route} className="mkt-nav-link">Blog</Link>
          <Link href={'/about' as Route} className="mkt-nav-link">À propos</Link>
          <Link href={'/reseller' as Route} className="mkt-nav-link">Reseller</Link>
          <Link href={'/contact' as Route} className="mkt-nav-link">Contact</Link>
        </div>
      </nav>

      <main>
        <section className="hero" style={{ paddingBottom: 24 }}>
          <div>
            <div className="hero-eyebrow">Devis sur-mesure · projets hors catalogue</div>
            <h1>
              Quand le <em>standard</em>
              <br />
              ne suffit pas.
            </h1>
            <p className="hero-lede">
              Grande quantité, papier spécifique, finition unique, kit assemblé manuellement,
              signage extérieur — on quote ce qui sort du wizard, sous 1-2 jours ouvrables.
            </p>
            <div className="hero-actions">
              <a href="#form" className="hero-cta-primary">Demander un devis ↓</a>
              <Link href={'/order/start' as Route} className="hero-cta-secondary">
                Voir le catalogue standard
              </Link>
            </div>
            <div className="hero-trust">
              <span className="hero-trust-item">Réponse sous 1-2 j ouvrables</span>
              <span className="hero-trust-item">Sans engagement</span>
              <span className="hero-trust-item">Quote détaillé + options</span>
            </div>
          </div>
        </section>

        <section style={{ padding: '40px 24px', maxWidth: 960, margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 400,
              margin: '0 0 24px',
              textAlign: 'center',
            }}
          >
            Pour quel <em>type de projet</em> ?
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 48,
            }}
          >
            {USE_CASES.map((uc) => (
              <div
                key={uc.title}
                style={{
                  padding: 20,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-lg)',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>{uc.emoji}</div>
                <h3 style={{ fontSize: 16, margin: '0 0 6px', fontWeight: 600 }}>{uc.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  {uc.description}
                </p>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: '24px 20px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-lg)',
              marginBottom: 48,
            }}
          >
            <h3 style={{ fontSize: 18, margin: '0 0 16px', fontWeight: 600 }}>
              Comment ça marche
            </h3>
            <ol style={{ margin: 0, paddingLeft: 24, fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              <li><strong style={{ color: 'var(--text-primary)' }}>Tu décris ton projet</strong> ci-dessous. Quantité, format, finitions — plus c&apos;est précis, plus le quote est précis.</li>
              <li><strong style={{ color: 'var(--text-primary)' }}>On regarde et on quote.</strong> 1-2 jours ouvrables. Tu reçois un email avec le prix détaillé + options.</li>
              <li><strong style={{ color: 'var(--text-primary)' }}>Tu valides.</strong> Si tu acceptes, on t&apos;envoie un lien de paiement Stripe + on planifie la prod.</li>
              <li><strong style={{ color: 'var(--text-primary)' }}>On livre au Canada.</strong> Tracking inclus, blind shipping si c&apos;est pour ton client.</li>
            </ol>
          </div>

          <h2
            id="form"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(22px, 4.5vw, 28px)',
              fontWeight: 400,
              margin: '0 0 16px',
              textAlign: 'center',
            }}
          >
            Décris ton <em>projet</em>
          </h2>
          <p
            style={{
              textAlign: 'center',
              fontSize: 14,
              color: 'var(--text-secondary)',
              maxWidth: 560,
              margin: '0 auto 24px',
              lineHeight: 1.6,
            }}
          >
            Tous les champs marqués * sont requis. Le reste, optionnel — ajoute ce que tu sais,
            on te recontacte pour les détails manquants.
          </p>

          <QuoteRequestForm />
        </section>
      </main>
    </>
  );
}

const USE_CASES = [
  {
    emoji: '📦',
    title: 'Quantité hors barème',
    description: '10 000+ cartes, 50 000+ flyers, runs très spécifiques avec mix multiple.',
  },
  {
    emoji: '🎨',
    title: 'Papier ou finition unique',
    description: 'Embossage, foil stamping, papier coton ou recyclé spécifique, vernis sélectif.',
  },
  {
    emoji: '📋',
    title: 'Signage ou substrats rigides',
    description: 'Foamcore, dibond, coroplast, bannières grand format, présentoirs en boutique.',
  },
  {
    emoji: '🎁',
    title: 'Packaging et kits',
    description: 'Boîtes pliantes custom, étiquettes adhésives, kits de bienvenue assemblés.',
  },
  {
    emoji: '📰',
    title: 'Édition et magazines',
    description: 'Brochures dos carré collé, magazines piqués, catalogues à pagination élevée.',
  },
  {
    emoji: '🤝',
    title: 'Reseller avec besoin spécial',
    description: 'Si tu es déjà reseller et que ton client veut quelque chose hors catalogue.',
  },
];
