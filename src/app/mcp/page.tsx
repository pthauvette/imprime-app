/**
 * /mcp — page d'installation publique du serveur MCP Plio (« commander par IA »).
 *
 * Page de docs développeur : endpoint, obtention de clé, snippets copier-coller
 * (Claude Code, mcp-remote, curl), liste des tools, et la limite OAuth pour les
 * connecteurs web claude.ai/ChatGPT (lecture seule sans clé).
 *
 * ⚠️ L'endpoint pointe sur www.plio.ca (l'apex plio.ca est un redirecteur
 * GET/HEAD-only → un POST JSON-RPC y renvoie 405). Server Component, zéro donnée
 * utilisateur (entièrement statique).
 */
import Link from 'next/link';
import type { Route } from 'next';
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd';
import { Icon } from '@/components/ui/Icon';
import MarketingHeader from '@/components/marketing/MarketingHeader';

export const metadata = {
  title: 'Commander Plio par IA — serveur MCP',
  description:
    "Branche Plio à Claude, Cursor ou tout agent IA via MCP : parcours le catalogue, obtiens des devis et passe commande directement depuis ta conversation. Endpoint, clé API et snippets copier-coller.",
};

const ENDPOINT = 'https://www.plio.ca/api/mcp/mcp';

/** Bloc de code mono, sélectionnable. */
function Code({ label, children }: { label?: string; children: string }) {
  return (
    <div style={{ margin: '12px 0' }}>
      {label && (
        <div
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6,
          }}
        >
          {label}
        </div>
      )}
      <pre
        style={{
          margin: 0, padding: '16px 18px', overflowX: 'auto',
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--r-lg)', fontFamily: 'var(--font-mono)', fontSize: 13,
          lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre',
        }}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

const TOOLS: { name: string; desc: string; auth: boolean }[] = [
  { name: 'list_print_products', desc: 'Catalogue curaté (produits + papiers).', auth: false },
  { name: 'get_product_options', desc: 'Papiers → finitions + quantités disponibles.', auth: false },
  { name: 'get_print_quote', desc: 'Prix CAD total + prix unitaire (= prix payé au checkout).', auth: false },
  { name: 'estimate_shipping', desc: 'Méthodes UPS/FedEx triées par prix vers une destination.', auth: false },
  { name: 'create_order', desc: 'Configure une commande et renvoie un lien de finalisation/paiement.', auth: true },
];

export default function McpPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Accueil', path: '/' },
          { name: 'MCP', path: '/mcp' },
        ])}
      />

      <MarketingHeader />

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '0 20px' }}>
        {/* HERO */}
        <section className="about-hero">
          <div className="page-eyebrow">Pour développeurs · serveur MCP</div>
          <h1>Commande Plio <em>par IA.</em></h1>
          <p>
            Plio expose un serveur <strong>MCP (Model Context Protocol)</strong> : branche-le à Claude,
            Cursor ou n&apos;importe quel agent, et il pourra parcourir le catalogue, calculer des
            devis et préparer une commande — directement dans ta conversation. Les devis sont
            <strong> identiques au prix payé</strong> sur le site.
          </p>
        </section>

        {/* CE QUE C'EST */}
        <section style={{ margin: '40px 0' }}>
          <div className="mission-eyebrow"><Icon name="star" size={14} /> Comment ça marche</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '-0.01em' }}>
            Un serveur <em>distant</em>, pas une installation locale.
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            C&apos;est un endpoint HTTP hébergé (transport <em>Streamable HTTP</em>). Les 4 outils de
            lecture (catalogue, options, devis, livraison) sont <strong>publics</strong> — aucune clé
            requise. Passer commande exige une <strong>clé API</strong> avec le scope <code>orders:write</code>.
          </p>
          <Code label="Endpoint">{ENDPOINT}</Code>
        </section>

        {/* ÉTAPE 1 — CLÉ */}
        <section style={{ margin: '40px 0' }}>
          <div className="mission-eyebrow"><Icon name="star" size={14} /> Étape 1 — ta clé API (pour commander)</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '-0.01em' }}>
            Génère une clé en 10 secondes.
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Connecte-toi puis va sur{' '}
            <Link href={'/account/api-keys' as Route} style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
              ton espace clés API
            </Link>{' '}
            → « Créer une clé ». Le token <code>plio_sk_live_…</code> n&apos;est affiché
            <strong> qu&apos;une seule fois</strong> — copie-le tout de suite. (Les devis et le
            catalogue fonctionnent sans clé.)
          </p>
        </section>

        {/* ÉTAPE 2 — BRANCHER */}
        <section style={{ margin: '40px 0' }}>
          <div className="mission-eyebrow"><Icon name="star" size={14} /> Étape 2 — brancher ton client</div>

          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20, marginBottom: 4 }}>
            Claude Code <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 400 }}>· le plus simple, auth complète</span>
          </h3>
          <Code label="Terminal">{`claude mcp add --transport http plio ${ENDPOINT} \\
  --header "Authorization: Bearer plio_sk_live_VOTRE_CLE"`}</Code>

          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20, margin: '24px 0 4px' }}>
            Claude Desktop / Cursor <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 400 }}>· via le pont mcp-remote</span>
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Dans le fichier de config MCP du client (<code>claude_desktop_config.json</code>, etc.) :
          </p>
          <Code label="config JSON">{`{
  "mcpServers": {
    "plio": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${ENDPOINT}",
               "--header", "Authorization:Bearer plio_sk_live_VOTRE_CLE"]
    }
  }
}`}</Code>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            <Icon name="alert" size={14} /> Colle <code>Authorization:Bearer …</code> <strong>sans espace</strong> après les
            deux-points — <code>mcp-remote</code> découpe mal les en-têtes contenant un espace.
          </p>

          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 20, margin: '24px 0 4px' }}>
            Tester sans rien installer <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 400 }}>· curl</span>
          </h3>
          <Code label="Terminal">{`curl -s ${ENDPOINT} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`}</Code>
        </section>

        {/* TOOLS */}
        <section style={{ margin: '40px 0' }}>
          <div className="mission-eyebrow"><Icon name="star" size={14} /> Les outils disponibles</div>
          <div style={{ marginTop: 12, border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
            {TOOLS.map((t, i) => (
              <div
                key={t.name}
                style={{
                  display: 'flex', gap: 16, alignItems: 'baseline', padding: '14px 18px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                }}
              >
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-primary)', minWidth: 180 }}>
                  {t.name}
                </code>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--text-secondary)' }}>{t.desc}</span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
                    fontWeight: 600, whiteSpace: 'nowrap',
                    color: t.auth ? 'var(--accent-primary)' : 'var(--text-muted)',
                  }}
                >
                  {t.auth ? <><Icon name="key" size={14} /> clé requise</> : 'public'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* OAUTH CAVEAT */}
        <section
          style={{
            margin: '40px 0', padding: 24, background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-xl)',
          }}
        >
          <div className="mission-eyebrow" style={{ marginBottom: 8 }}><Icon name="star" size={14} /> claude.ai &amp; ChatGPT (connecteurs web)</div>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Tu peux ajouter l&apos;endpoint comme <strong>connecteur personnalisé</strong> dans
            claude.ai ou ChatGPT (Paramètres → Connecteurs → URL ci-dessus). Les <strong>4 outils
            publics</strong> (catalogue, options, devis, livraison) fonctionneront. En revanche,
            <code> create_order</code> exige une clé en en-tête <code>Bearer</code>, que ces
            interfaces web ne permettent pas encore de fournir — utilise <strong>Claude Code</strong>
            {' '}ou le pont <strong>mcp-remote</strong> pour passer commande par IA.
          </p>
        </section>

        {/* CTA */}
        <div className="cta-section">
          <h2>Une question d&apos;intégration ?</h2>
          <p>
            Écris-nous à{' '}
            <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>bonjour@plio.ca</a>.
          </p>
          <Link href={'/account/api-keys' as Route} className="cta-btn">Créer ma clé API →</Link>
        </div>
      </main>

      <footer>
        <div className="footer-grid">
          <div className="footer-brand">
            <span className="footer-brand-mark">Plio.</span>
            <p className="footer-brand-text">Print wholesale au Canada — maintenant pilotable par IA via MCP.</p>
          </div>
          <div className="footer-col">
            <h4>Produit</h4>
            <ul>
              <li><Link href={'/order/start' as Route}>Commander</Link></li>
              <li><Link href={'/mcp' as Route}>Serveur MCP</Link></li>
              <li><Link href={'/account/api-keys' as Route}>Clés API</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Aide</h4>
            <ul>
              <li><Link href={'/help' as Route}>Centre d&apos;aide</Link></li>
              <li><Link href={'/contact' as Route}>Contact</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Légal</h4>
            <ul>
              <li><Link href={'/legal/terms' as Route}>Conditions</Link></li>
              <li><Link href={'/legal/privacy' as Route}>Confidentialité</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span><Icon name="star" size={14} /> © Plio 2026 · Imprimé au Canada 🇨🇦</span>
          <span>Démocratik inc. · Montréal</span>
        </div>
      </footer>
    </>
  );
}
