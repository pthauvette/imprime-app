/**
 * /reseller/guide — content marketing pour les resellers actifs et
 * candidats. Round 29 #5.
 *
 * Sections :
 *   1. Pricing strategy (markup typique, packaging tiers)
 *   2. Client acquisition (referral, niches, samples)
 *   3. Repeat orders (saved configs, wallet auto-renew, monthly templates)
 *   4. Tier reseller mechanics (5 % discount, AUTO_DETECTED → VERIFIED)
 *   5. CTA Apply (lien vers /reseller landing)
 *
 * Static MDX-like content (pure React server). Server Component, zéro JS,
 * SEO-optimized (h2 hierarchy, intra-link, metadata title/description).
 */

import Link from 'next/link';
import type { Route } from 'next';
import MarketingHeader from '@/components/marketing/MarketingHeader';

export const metadata = {
  title: 'Guide reseller — comment grandir avec Plio',
  description:
    'Stratégies prouvées pour les imprimeurs revendeurs : pricing, acquisition client, fidélisation, optimisation du tier 5 % Plio.',
};

export default function ResellerGuidePage() {
  return (
    <>
      <MarketingHeader />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 96px', lineHeight: 1.6 }}>
        <nav style={{ marginBottom: 16, fontSize: 12 }}>
          <Link href={'/reseller' as Route} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
            ← Programme reseller
          </Link>
        </nav>

        <header style={{ marginBottom: 40 }}>
          <div className="page-eyebrow">Guide reseller</div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(36px, 5vw, 56px)',
              fontWeight: 400,
              letterSpacing: '-0.025em',
              margin: '8px 0 16px',
              lineHeight: 1.1,
            }}
          >
            Comment <em style={{ color: 'var(--accent-primary)' }}>grandir</em> ton biz<br />
            de revente d&apos;imprimés.
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-secondary)', margin: 0 }}>
            Stratégies que nos meilleurs resellers utilisent. Issu d&apos;observations directes sur
            <strong> 100+ comptes B2B actifs</strong> qui font 3-12 commandes par mois.
          </p>
        </header>

        <Toc />

        <Section id="pricing" title="1. Pricing — combien charger à ton client ?">
          <p>
            Markup typique pour la revente imprimée varie entre <strong>40 % et 80 %</strong> selon le niveau
            de service (livraison, design, conseil) que tu ajoutes au-dessus du print pur.
          </p>
          <ul>
            <li>
              <strong>Markup 40 %</strong> : tu livres juste les fichiers print-ready et le client paie une
              commande à son nom. Marge mince mais volume scalable, peu de hand-holding.
            </li>
            <li>
              <strong>Markup 60 %</strong> : tu fournis la conception (50 $ flat) + tu commandes pour ton
              client. C&apos;est le sweet-spot pour la majorité de nos resellers.
            </li>
            <li>
              <strong>Markup 80 % +</strong> : tu offres un service white-glove (design illimité, devis sur
              mesure, hosting d&apos;assets, support email). Réservé aux gros comptes récurrents.
            </li>
          </ul>
          <Callout>
            <strong>Astuce :</strong> les <Link href={'/compare' as Route} style={{ color: 'var(--accent-primary)' }}>pages
            comparaison</Link> sont utiles pour justifier ton markup — montre au client &laquo; tu pourrais
            avoir le bas de gamme à X $, mais voici ce que tu obtiens avec mon service &raquo;.
          </Callout>
        </Section>

        <Section id="acquisition" title="2. Acquisition client — où trouver ta première base">
          <p>
            Les resellers qui scalent vite ont 2 choses en commun : un <strong>positionnement de niche</strong>
            et un <strong>portfolio visible</strong> qui démarre la conversation.
          </p>
          <h3 style={subhead}>Cible une niche, pas tout le monde</h3>
          <p>
            &laquo; Cartes pour restos &raquo; convertit 3-5× mieux que &laquo; cartes pour tout le monde &raquo;. La
            niche te donne du langage commun, des cas d&apos;usage spécifiques, et te place dans le top des
            résultats Google pour les recherches locales.
          </p>
          <h3 style={subhead}>Portfolio visible</h3>
          <p>
            Instagram + LinkedIn + Google Business Profile minimum. Poste les <strong>résultats finaux</strong>
            (carte sur table, flyer affiché) — pas juste les mockups. Photos de vrais clients = preuve sociale.
          </p>
        </Section>

        <Section id="repeat" title="3. Fidélisation — la machine à commandes récurrentes">
          <p>
            Une nouvelle commande te coûte 5-10× plus cher en effort qu&apos;une commande récurrente. Investis
            dans les 3 mécaniques qui ramènent automatiquement le client.
          </p>
          <ul>
            <li>
              <strong>Saved configs</strong> : crée un &laquo; preset Client X &raquo; sur Plio. À la prochaine
              demande, 2 clicks pour ré-ordonner avec la même quantité, même papier, mêmes finitions.
            </li>
            <li>
              <strong>Wallet auto-renew</strong> : configure un top-up mensuel ($200-500) pour absorber le
              cashflow de tes commandes sans devoir saisir la carte chaque fois. Bonus +5 à 12 % selon le tier.
              Tu peux <Link href={'/wallet' as Route} style={{ color: 'var(--accent-primary)' }}>mettre en
              pause</Link> pendant les périodes creuses sans cancel.
            </li>
            <li>
              <strong>Templates mensuels</strong> : propose à tes clients un &laquo; package mensuel &raquo; (ex:
              500 cartes + 200 flyers + livraison) à prix fixe. Prédictible pour eux, revenu récurrent pour toi.
            </li>
          </ul>
        </Section>

        <Section id="tier" title="4. Comment débloquer le tier RESELLER (5 % off auto)">
          <p>
            Plio détecte automatiquement les power-buyers : <strong>≥ 5 commandes payées dans les
            12 derniers mois</strong> → bascule en statut <code>AUTO_DETECTED</code>. Tu peux ensuite
            confirmer ton statut depuis ton tableau de bord pour passer <code>VERIFIED</code> et activer le
            rabais 5 % auto sur chaque commande.
          </p>
          <p>
            Le rabais s&apos;applique <strong>au checkout</strong> sans code à entrer. Tu vois aussi tes
            stats mensuelles dans le récap email que tu reçois le 1er du mois (orders + dépensé + rabais
            cumulé).
          </p>
          <Callout>
            <strong>Sans surprise :</strong> on n&apos;impose pas de minimum d&apos;achats pour garder le
            statut. Si tu ralentis (slow season, congé), tu gardes ton VERIFIED. Si tu dépasses
            l&apos;équivalent de 2000 $ sur 365 jours, tu débloques aussi le tier loyauté GOLD avec free
            shipping standard.
          </Callout>
        </Section>

        <Section id="cta" title="Prêt à monter en gamme ?">
          <p>
            Si tu n&apos;es pas encore reseller, le processus prend 2 minutes : tu remplis ton volume mensuel
            estimé, on revoit, et tu reçois ton statut sous 1-2 jours ouvrables.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
            <Link
              href={'/reseller' as Route}
              style={{
                display: 'inline-block',
                padding: '14px 28px',
                background: 'var(--accent-primary)',
                color: 'var(--text-on-accent)',
                borderRadius: 'var(--r-pill)',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Devenir reseller →
            </Link>
            <Link
              href={'/contact' as Route}
              style={{
                display: 'inline-block',
                padding: '14px 28px',
                background: 'transparent',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--r-pill)',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Parler à l&apos;équipe
            </Link>
          </div>
        </Section>
      </main>
    </>
  );
}

const subhead: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 18,
  fontWeight: 500,
  margin: '16px 0 6px',
  color: 'var(--text-primary)',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 40 }}>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          fontWeight: 400,
          letterSpacing: '-0.015em',
          margin: '32px 0 12px',
          scrollMarginTop: 24,
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{children}</div>
    </section>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: '16px 0',
        padding: '14px 18px',
        background: 'var(--bg-surface)',
        borderLeft: '3px solid var(--accent-primary)',
        borderRadius: '4px 8px 8px 4px',
        fontSize: 14,
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </div>
  );
}

function Toc() {
  const items: Array<{ id: string; label: string }> = [
    { id: 'pricing', label: 'Pricing — combien charger ?' },
    { id: 'acquisition', label: 'Acquisition client' },
    { id: 'repeat', label: 'Fidélisation' },
    { id: 'tier', label: 'Tier RESELLER 5 % off' },
    { id: 'cta', label: 'Devenir reseller' },
  ];
  return (
    <nav
      aria-label="Sommaire"
      style={{
        marginBottom: 40,
        padding: 16,
        background: 'var(--bg-sunken)',
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        Au programme
      </div>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-primary)' }}>
        {items.map((it) => (
          <li key={it.id} style={{ marginBottom: 4 }}>
            <a href={`#${it.id}`} style={{ color: 'inherit' }}>{it.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
