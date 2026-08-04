/**
 * /compare?ids=1,7,12 — side-by-side product comparison.
 *
 * Round 29 #3. Server Component qui fetch getProductDetail pour chaque
 * id en parallèle + render une table de comparaison (specs, options
 * counts, prix entry-level).
 *
 * Cap : 3 IDs max (au-delà, table devient illisible mobile).
 *
 * Pourquoi pas de selection UI dans ce PR :
 *   Scope tight. Le compare page est utile en standalone via deep-link
 *   (SEO crawl, email marketing). Selection UX (sticky bar + checkboxes
 *   sur /order/start) reportée à un follow-up PR.
 *
 * Use cases live :
 *   1. SEO : sitemap pourra inclure /compare?ids=1,7 pour topical pages
 *   2. Email marketing : "compare nos 14pt vs 16pt" lien direct
 *   3. Help center : article "comment choisir" lien vers une compare
 *
 * Pattern : Sinalite cache (getProductDetail) protège contre rate-limit
 * + outage. Si tous les fetches throw, on render gracefully.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { sinalite } from '@/lib/sinalite/client';
import { applyProductOverrides } from '@/lib/products/overrides';
import { getStartingPrices } from '@/lib/products/starting-price-store';
import { formatCents } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import MarketingFooter from '@/components/marketing/MarketingFooter';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Comparer les produits',
  description: 'Compare jusqu\'à 3 produits Plio côte-à-côte : options, prix, livraison.',
};

const MAX_COMPARE = 3;

interface PageProps {
  searchParams: Promise<{ ids?: string }>;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const idsParam = sp.ids ?? '';

  const ids = idsParam
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, MAX_COMPARE);

  if (ids.length === 0) {
    return <EmptyState />;
  }

  // Fetch detail per id en parallèle. .catch fallback null → on render
  // une carte error pour ce product sans casser les autres.
  const products = await Promise.all(
    ids.map(async (id) => {
      try {
        // listProducts pour le nom (cheap call cached)
        const list = await sinalite.listProducts();
        const brut = list.find((p) => p.id === id);
        if (!brut) return { id, error: 'Produit introuvable', summary: null, detail: null };

        // ⚠️ `applyProductOverrides` — le nom Sinalite BRUT fuitait ici, sur une
        // page PUBLIQUE de deep-link SEO : « Business cards 14pt (Profit
        // Maximizer) », « … (High Gloss) », « … (C1S) » sont des libellés
        // INTERNES fournisseur. La même fuite avait été fermée sur
        // /order/configure (#540) et couverte par les noms marketing
        // (#542/#543) ; /compare n'avait jamais été rebranché.
        const [summary] = await applyProductOverrides([brut]);
        const detail = await sinalite.getProductDetail(id);
        return { id, error: null, summary, detail };
      } catch (err) {
        return {
          id,
          error: err instanceof Error ? err.message : 'Erreur fetch',
          summary: null,
          detail: null,
        };
      }
    }),
  );

  // Prix « à partir de » : la MÊME source que le catalogue (`/order/product`),
  // c'est-à-dire le minimum réel de la matrice de variantes, markup inclus.
  //
  // ⚠️ Avant, cette page prenait `Math.min` sur `detail.pricing` — qui n'est PAS
  // une liste de prix produits mais les SUPPLÉMENTS par option. Le minimum non
  // nul valait donc 1 ¢, et la page annonçait publiquement « Prix dès 0.01 $ »
  // sur les trois cartes de visite comparées. Un id absent du magasin n'affiche
  // rien plutôt qu'un chiffre inventé (même règle que le catalogue).
  const priceMap = await getStartingPrices(ids);
  const lowestPrices = ids.map((id) => priceMap.get(id) ?? null);
  const lowest = lowestPrices.filter((p): p is number => p !== null).sort((a, b) => a - b)[0] ?? null;

  return (
    <>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 24px 96px' }}>
      <nav style={{ marginBottom: 12, fontSize: 12 }}>
        <Link href={'/' as Route} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
          ← Plio
        </Link>
        {' · '}
        <Link href={'/order/start' as Route} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
          Tous les produits
        </Link>
      </nav>

      <header style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(32px, 5vw, 48px)',
            fontWeight: 400,
            letterSpacing: '-0.025em',
            margin: '0 0 8px',
            lineHeight: 1.1,
          }}
        >
          Comparer · {products.length} produit{products.length > 1 ? 's' : ''}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Specs, prix entry-level, livraison. Compare jusqu&apos;à {MAX_COMPARE} produits côte-à-côte.
          {products.length < MAX_COMPARE && (
            <>
              {' '}
              {/* Avant : « Ajoute un id à l'URL : ?ids=1,7,NN ». Une consigne de
                  développeur sur une page PUBLIQUE — le client était invité à
                  bricoler une query string avec des identifiants internes. */}
              <span style={{ color: 'var(--text-muted)' }}>
                Tu peux en comparer jusqu&apos;à {MAX_COMPARE} :{' '}
                <Link href={'/order/start' as Route} style={{ color: 'var(--accent-primary)' }}>
                  choisis-en un autre au catalogue
                </Link>
                .
              </span>
            </>
          )}
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${products.length}, minmax(220px, 1fr))`,
          gap: 12,
          marginBottom: 32,
          overflowX: 'auto',
        }}
      >
        {products.map((p, idx) => (
          <ProductCard
            key={p.id}
            id={p.id}
            error={p.error}
            summary={p.summary}
            detail={p.detail}
            startingCents={lowestPrices[idx]}
            isLowest={lowest !== null && lowestPrices[idx] === lowest}
          />
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        Prix entry-level = combinaison minimale (taille, papier, qty les plus accessibles). Les options
        haut de gamme peuvent multiplier le prix 5-10×.
      </p>
      </main>
      {/* La nav minimaliste est VOULUE (deep-link SEO), le footer manquant ne
          l'était pas : la page n'offrait aucun lien légal ni contact. */}
      <MarketingFooter />
    </>
  );
}

function EmptyState() {
  return (
    <>
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
      {/* Icône maison plutôt qu'un emoji : décoratif → migré (cf. Icon.tsx). */}
      <div style={{ marginBottom: 16, color: 'var(--text-muted)' }}>
        <Icon name="chart" size={40} />
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, margin: '0 0 12px' }}>
        Aucun produit à comparer
      </h1>
      {/* Avant : « Ajoute des produits à l'URL via ?ids=1,7,12 ». On n'écrit pas
          une consigne de query string à un client — on lui donne le chemin. */}
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
        Choisis jusqu&apos;à {MAX_COMPARE} produits au catalogue pour les voir côte à côte —
        specs, prix de départ et délais.
      </p>
      <Link
        href={'/order/start' as Route}
        style={{
          display: 'inline-block',
          padding: '12px 22px',
          background: 'var(--accent-primary)',
          color: '#fff',
          borderRadius: 'var(--r-pill)',
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Voir les produits →
      </Link>
      </main>
      <MarketingFooter />
    </>
  );
}

function ProductCard({
  id,
  error,
  summary,
  detail,
  startingCents,
  isLowest,
}: {
  id: number;
  error: string | null;
  summary: { name: string; category: string } | null;
  detail: { options: Array<{ id: number; group: string; name: string }>; pricing: Array<{ value: string }> } | null;
  startingCents: number | null;
  isLowest: boolean;
}) {
  if (error || !summary) {
    return (
      <div
        style={{
          padding: 20,
          background: 'var(--bg-surface)',
          border: '1px dashed var(--danger)',
          borderRadius: 'var(--r-xl)',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 12,
        }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--danger)', marginBottom: 4 }}>
          ID {id}
        </div>
        Produit indisponible — {error ?? 'erreur'}
      </div>
    );
  }

  const optionCount = detail?.options.length ?? 0;
  const groupCount = detail ? new Set(detail.options.map((o) => o.group)).size : 0;

  return (
    <div
      style={{
        padding: 20,
        background: 'var(--bg-surface)',
        border: `1px solid ${isLowest ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--r-xl)',
        position: 'relative',
      }}
    >
      {isLowest && (
        <div
          style={{
            position: 'absolute',
            top: -12,
            left: 12,
            background: 'var(--accent-primary)',
            color: '#fff',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 'var(--r-pill)',
          }}
        >
          $ le + bas
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
        {summary.category} · #{id}
      </div>
      {/* `h2` et non `div` : chaque produit comparé EST une section de la page.
          Un lecteur d'écran peut ainsi sauter de produit en produit au lieu de
          parcourir toute la carte. `margin: 0` préserve le rendu exact. */}
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, lineHeight: 1.2, margin: '0 0 16px', minHeight: 50 }}>
        {summary.name}
      </h2>

      {/* `formatCents` et non `toFixed(2)` : le point décimal anglais s'affichait
          en fr-CA (« 0.01 $ »). Cf. le commentaire de format.ts — 48 sites
          faisaient cette interpolation à la main avant qu'on l'unifie. */}
      <Spec label="Prix dès" value={startingCents !== null ? formatCents(startingCents) : '—'} highlight />
      <Spec label="Options dispo" value={optionCount > 0 ? String(optionCount) : '—'} />
      <Spec label="Groupes d'options" value={groupCount > 0 ? String(groupCount) : '—'} />

      <Link
        href={`/order/start?product=${id}` as Route}
        style={{
          display: 'block',
          marginTop: 16,
          padding: '10px 16px',
          background: 'var(--text-primary)',
          color: '#fff',
          borderRadius: 'var(--r-pill)',
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Configurer →
      </Link>
    </div>
  );
}

function Spec({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px dashed var(--border-subtle)', fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: highlight ? 700 : 500, color: highlight ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
        {value}
      </span>
    </div>
  );
}
