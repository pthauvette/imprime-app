/**
 * /track — Page publique pour suivre une commande sans login.
 *
 * Form simple : numéro de commande + email (le pair sert de preuve de
 * propriété légère). POST à /api/track → affiche la même timeline que
 * /orders/[id] mais sans les détails sensibles (prix, items, adresse).
 *
 * Use case : un customer reçoit un email "ta commande a expédié" mais
 * ne se souvient plus du compte → /track + email = self-serve, pas de
 * support ticket.
 *
 * Pas de PII dans l'URL — on est passé d'un GET avec ?email=... à un POST
 * via Client Component pour éviter de logger l'email dans les access logs
 * et les referrer headers de pages externes.
 *
 * Le rate-limit serveur (5 req/15min/IP) prévient l'enumeration.
 */

import Link from 'next/link';
import type { Route } from 'next';
import TrackingForm from './TrackingForm';
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd';

export const metadata = {
  title: 'Suivre ma commande — Plio',
  description:
    'Suis l\'avancement de ta commande Plio en temps réel. Entre ton numéro de commande et ton email — pas besoin de te connecter.',
};

export default function TrackPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Accueil', path: '/' },
          { name: 'Suivre ma commande', path: '/track' },
        ])}
      />

      <nav className="mkt-nav">
        <Link href={'/' as Route} className="mkt-brand">Plio.</Link>
        <div className="mkt-nav-links">
          <Link href={'/order/start' as Route} className="mkt-nav-link">Produits</Link>
          <Link href={'/blog' as Route} className="mkt-nav-link">Blog</Link>
          <Link href={'/help' as Route} className="mkt-nav-link">Aide</Link>
          <Link href={'/contact' as Route} className="mkt-nav-link">Contact</Link>
          <Link href={'/order/start' as Route} className="mkt-nav-cta">Commander →</Link>
        </div>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 96px' }}>
        <header style={{ marginBottom: 32, textAlign: 'center' }}>
          <div className="page-eyebrow">Suivi de commande</div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(36px, 5vw, 48px)',
              letterSpacing: '-0.025em',
              fontWeight: 400,
              lineHeight: 1.1,
              margin: '8px 0 16px',
            }}
          >
            Où est <em style={{ color: 'var(--accent-primary)' }}>ma commande</em> ?
          </h1>
          <p
            style={{
              fontSize: 16,
              color: 'var(--text-secondary)',
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.55,
            }}
          >
            Pas besoin de te connecter. Entre ton numéro de commande (commence
            souvent par «&nbsp;SIN-&nbsp;») et l&apos;email utilisé au moment de l&apos;achat.
          </p>
        </header>

        <TrackingForm />

        <section
          style={{
            marginTop: 56,
            padding: 24,
            background: 'var(--surface-subtle, var(--bg-sunken))',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg)',
            display: 'grid',
            gap: 10,
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 400,
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            Tu cherches le numéro de commande ?
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
            On t&apos;envoie un email <strong>«&nbsp;Commande confirmée&nbsp;»</strong> à chaque achat.
            Le numéro est dans le sujet et dans le corps. Si tu as un compte, tu peux aussi
            le retrouver dans{' '}
            <Link href={'/orders' as Route} style={{ color: 'var(--accent-primary)' }}>
              Mes commandes
            </Link>
            .
          </p>
        </section>
      </main>
    </>
  );
}
