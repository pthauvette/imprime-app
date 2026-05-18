/**
 * /reseller — landing du programme reseller B2B.
 *
 * Server Component pour le contenu marketing + JSON-LD. Le form est un
 * Client Component (ResellerApplicationForm) qui POST /api/reseller/apply.
 */

import Link from 'next/link';
import type { Route } from 'next';
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd';
import ResellerApplicationForm from './ResellerApplicationForm';

export const metadata = {
  title: 'Programme reseller — Plio',
  description: 'Pour les agences, freelances et studios qui revendent du print à leurs clients. Tarif wholesale, blind shipping inclus, application gratuite — validation sous 1-2 jours.',
};

export default function ResellerPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Accueil', path: '/' },
          { name: 'Programme reseller', path: '/reseller' },
        ])}
      />

      <nav className="mkt-nav">
        <Link href={'/' as Route} className="mkt-brand">Plio.</Link>
        <div className="mkt-nav-links">
          <Link href={'/order/start' as Route} className="mkt-nav-link">Produits</Link>
          <Link href={'/blog' as Route} className="mkt-nav-link">Blog</Link>
          <Link href={'/about' as Route} className="mkt-nav-link">À propos</Link>
          <Link href={'/reseller' as Route} className="mkt-nav-link active">Reseller</Link>
          <Link href={'/contact' as Route} className="mkt-nav-link">Contact</Link>
        </div>
      </nav>

      <main>
        <section className="hero" style={{ paddingBottom: 24 }}>
          <div>
            <div className="hero-eyebrow">Programme reseller · B2B</div>
            <h1>
              Pour les <em>agences</em> et <em>studios</em>
              <br />
              qui revendent du print.
            </h1>
            <p className="hero-lede">
              Tarif wholesale, blind shipping inclus, livraison sans marque Plio. Application
              gratuite, sans engagement, validation sous 1-2 jours ouvrables.
            </p>
            <div className="hero-actions">
              <a href="#apply" className="hero-cta-primary">Postuler maintenant ↓</a>
              <a href="mailto:patrick@plio.ca" className="hero-cta-secondary">Parler à un humain</a>
            </div>
            <div className="hero-trust">
              <span className="hero-trust-item">Validation 1-2 j ouvrables</span>
              <span className="hero-trust-item">Sans frais d&apos;adhésion</span>
              <span className="hero-trust-item">Blind shipping inclus</span>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section
          style={{
            maxWidth: 1080,
            margin: '40px auto 0',
            padding: '0 28px',
          }}
        >
          <div className="mission-eyebrow" style={{ marginBottom: 12 }}>★ Ce que tu obtiens</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 32px' }}>
            Quatre <em>avantages concrets.</em>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                style={{
                  padding: 24,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-lg)',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 12 }}>{b.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 8px' }}>
                  {b.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                  {b.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section
          style={{
            maxWidth: 1080,
            margin: '64px auto 0',
            padding: '0 28px',
          }}
        >
          <div className="mission-eyebrow" style={{ marginBottom: 12 }}>★ Comment ça marche</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 32px' }}>
            Trois étapes, <em>aucune friction.</em>
          </h2>
          <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, padding: 0, listStyle: 'none', margin: 0 }}>
            {STEPS.map((s, i) => (
              <li key={s.title} style={{ padding: 24, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--accent-primary)', fontWeight: 700, marginBottom: 8 }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 8px' }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
                  {s.desc}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section
          style={{
            maxWidth: 760,
            margin: '64px auto 0',
            padding: '0 28px',
          }}
        >
          <div className="mission-eyebrow" style={{ marginBottom: 12 }}>★ Questions fréquentes</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 24px' }}>
            Avant de postuler.
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {FAQS.map((f) => (
              <details
                key={f.q}
                style={{
                  padding: 20,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {f.q}
                </summary>
                <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Apply form */}
        <section
          id="apply"
          style={{
            maxWidth: 760,
            margin: '64px auto 96px',
            padding: '0 28px',
          }}
        >
          <div className="mission-eyebrow" style={{ marginBottom: 12 }}>★ Postuler</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
            Application reseller.
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px' }}>
            On répond sous 1-2 jours ouvrables. Aucun engagement, gratuit.
          </p>
          <ResellerApplicationForm />
        </section>
      </main>
    </>
  );
}

const BENEFITS = [
  {
    icon: '💰',
    title: 'Tarif wholesale',
    desc: 'Tu factures à ton tarif retail, tu paies au tarif wholesale Plio. La marge te revient en entier.',
  },
  {
    icon: '📦',
    title: 'Blind shipping',
    desc: 'Le colis arrive chez ton client sans logo Plio nulle part. Bordereau anonyme, packing slip neutre.',
  },
  {
    icon: '⚡',
    title: 'Devis instantané',
    desc: 'Pas besoin d\'attendre 48 h pour donner un prix à ton client. Le wizard te donne le coût final en 2 minutes.',
  },
  {
    icon: '🇨🇦',
    title: '100 % imprimé au Canada',
    desc: 'Pas d\'outsource étranger. Tes clients reçoivent leur commande en 4-7 jours.',
  },
];

const STEPS = [
  {
    title: 'Tu postules',
    desc: 'Formulaire ci-dessous : 3 min à remplir, on demande juste les essentiels.',
  },
  {
    title: 'On valide',
    desc: 'Sous 1-2 jours ouvrables, on regarde ton site / portfolio et on confirme.',
  },
  {
    title: 'Tu commandes',
    desc: 'Account activé avec le tier reseller. Tarif wholesale appliqué auto à tes commandes.',
  },
];

const FAQS = [
  {
    q: 'Quel volume minimum pour être accepté ?',
    a: 'Pas de minimum strict. On regarde le sérieux de la démarche, le portfolio / site web, et le type de clients que tu sers. Un freelance avec 3 clients réguliers est aussi valide qu\'une agence de 20 personnes.',
  },
  {
    q: 'Y a-t-il des frais d\'adhésion ?',
    a: 'Zéro. Pas d\'abonnement mensuel, pas de frais cachés. Tu paies seulement les commandes que tu passes — au tarif wholesale.',
  },
  {
    q: 'Le blind shipping coûte-t-il extra ?',
    a: 'Non, c\'est inclus dans toutes les commandes des comptes reseller. Le colis part avec ton adresse comme expéditeur (si tu veux), aucun logo Plio sur les bordereaux.',
  },
  {
    q: 'Puis-je facturer mon client à mon nom ?',
    a: 'Oui. La facture Plio est pour toi (reseller). Tu émets ta propre facture à ton client final au tarif que tu veux. On ne contacte jamais ton client directement.',
  },
  {
    q: 'Y a-t-il une API pour intégrer Plio à mon flux de travail ?',
    a: 'Pas encore — pour MVP on s\'attend que tu utilises le wizard standard. Une API resellers viendra quand on aura assez de demande pour la justifier. Si c\'est un blocker pour toi, dis-le dans ton application, on priorisera.',
  },
];
