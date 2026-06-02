/**
 * ProductListClient — UI interactive du step 2 wizard (/order/product).
 *
 * Responsabilités :
 *  - Search input (focus auto au cmd+K / ctrl+K)
 *  - Filter tabs (Tous / Bestsellers / Premium / Eco / Spécialité)
 *  - Sort dropdown (Populaires / Nom A-Z / Nom Z-A / ID)
 *  - Render des product rows
 *
 * On reçoit les produits déjà enrichis du Server Component parent (déjà
 * filtrés par famille + admin overrides appliqués). Toute la logique
 * filter/sort/search est purement client — pas de round-trip serveur.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { EnrichedProduct } from '@/lib/products/overrides';
import { DELIVERY_WINDOW } from '@/lib/content/marketing';

type SortKey = 'popular' | 'name-asc' | 'name-desc' | 'id-asc';
type FilterKey = 'all' | 'bestseller' | 'premium' | 'eco' | 'specialty';

interface Flags {
  isBestseller: boolean;
  isPremium: boolean;
  isEco: boolean;
  isSpecialty: boolean;
  finishClass: string;
}

function deriveFlags(product: EnrichedProduct): Flags {
  const lower = product.name.toLowerCase();
  const isBestseller =
    product.override?.featured ?? (lower.includes('uv') || lower.includes('14pt'));
  const isPremium =
    lower.includes('soft touch') ||
    lower.includes('18pt') ||
    lower.includes('foil') ||
    lower.includes('lamination');
  const isEco = lower.includes('kraft') || lower.includes('recycled');
  const isSpecialty =
    lower.includes('foil') ||
    lower.includes('letterpress') ||
    lower.includes('die') ||
    lower.includes('emboss') ||
    lower.includes('spot') ||
    lower.includes('round corner');

  let finishClass = '';
  if (lower.includes('uv') || lower.includes('gloss')) finishClass = 'gloss';
  else if (lower.includes('matte')) finishClass = 'matte';
  else if (lower.includes('foil')) finishClass = 'foil';
  else if (lower.includes('soft touch')) finishClass = 'soft';
  else if (lower.includes('kraft')) finishClass = 'kraft';

  return { isBestseller, isPremium, isEco, isSpecialty, finishClass };
}

const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'bestseller', label: 'Bestsellers' },
  { key: 'premium', label: 'Premium' },
  { key: 'eco', label: 'Eco' },
  { key: 'specialty', label: 'Spécialité' },
];

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'popular', label: 'Populaires' },
  { key: 'name-asc', label: 'Nom A → Z' },
  { key: 'name-desc', label: 'Nom Z → A' },
  { key: 'id-asc', label: 'ID Sinalite' },
];

export default function ProductListClient({
  products,
}: {
  products: EnrichedProduct[];
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('popular');
  const [sortOpen, setSortOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Pré-calcule les flags une seule fois — pas à chaque keystroke.
  const enriched = useMemo(
    () => products.map((p) => ({ p, flags: deriveFlags(p) })),
    [products],
  );

  // cmd+K / ctrl+K → focus la search box (et la sélectionne)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
        setQuery('');
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = enriched;

    if (filter !== 'all') {
      list = list.filter(({ flags }) => {
        if (filter === 'bestseller') return flags.isBestseller;
        if (filter === 'premium') return flags.isPremium;
        if (filter === 'eco') return flags.isEco;
        if (filter === 'specialty') return flags.isSpecialty;
        return true;
      });
    }

    if (q) {
      list = list.filter(({ p }) => {
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false) ||
          p.category.toLowerCase().includes(q) ||
          String(p.id).includes(q)
        );
      });
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === 'name-asc') return a.p.name.localeCompare(b.p.name);
      if (sort === 'name-desc') return b.p.name.localeCompare(a.p.name);
      if (sort === 'id-asc') return a.p.id - b.p.id;
      // popular = featured d'abord, puis bestsellers, puis nom
      const aRank = (a.p.override?.featured ? 2 : 0) + (a.flags.isBestseller ? 1 : 0);
      const bRank = (b.p.override?.featured ? 2 : 0) + (b.flags.isBestseller ? 1 : 0);
      if (aRank !== bRank) return bRank - aRank;
      return a.p.name.localeCompare(b.p.name);
    });

    return sorted;
  }, [enriched, query, filter, sort]);

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Populaires';

  return (
    <>
      <div
        className="toolbar"
        style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
      >
        <span className="toolbar-count">
          <strong>{visible.length}</strong> produit{visible.length > 1 ? 's' : ''}
          {visible.length !== products.length && (
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
              / {products.length}
            </span>
          )}
        </span>

        {/* Search input — focus avec cmd+K */}
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un produit, SKU…   ⌘K"
            aria-label="Rechercher un produit"
            style={{
              width: '100%',
              padding: '8px 12px 8px 32px',
              fontSize: 13,
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
          />
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
              fontSize: 14,
            }}
          >
            ⌕
          </span>
        </div>

        <div className="filter-tabs" role="tablist">
          {FILTER_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              className={`filter-tab${filter === t.key ? ' active' : ''}`}
              onClick={() => setFilter(t.key)}
              style={{
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                font: 'inherit',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Sort dropdown — click pour open, click ailleurs ferme */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="sort-dropdown"
            onClick={() => setSortOpen((v) => !v)}
            aria-expanded={sortOpen}
            aria-haspopup="listbox"
          >
            Trier : {currentSortLabel}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {sortOpen && (
            <>
              <div
                aria-hidden
                onClick={() => setSortOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              />
              <ul
                role="listbox"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 41,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-sm)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  padding: 4,
                  minWidth: 200,
                  margin: 0,
                  listStyle: 'none',
                }}
              >
                {SORT_OPTIONS.map((o) => (
                  <li key={o.key} role="option" aria-selected={sort === o.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setSort(o.key);
                        setSortOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: sort === o.key ? 'var(--accent-soft)' : 'transparent',
                        color: sort === o.key ? 'var(--accent-primary)' : 'var(--text-primary)',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: sort === o.key ? 600 : 400,
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      {o.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div
          style={{
            padding: '48px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--r-md)',
            marginTop: 16,
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>
            Aucun résultat pour « {query || filter} ».
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
            style={{
              padding: '6px 14px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-pill)',
              background: 'transparent',
              fontSize: 12,
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : (
        <div className="product-list">
          {visible.map(({ p, flags }, i) => (
            <ProductRow key={p.id} product={p} flags={flags} index={i} />
          ))}
        </div>
      )}
    </>
  );
}

function ProductRow({
  product,
  flags,
  index,
}: {
  product: EnrichedProduct;
  flags: Flags;
  index: number;
}) {
  return (
    <Link
      href={`/order/configure?productId=${product.id}` as Route}
      className="product-row"
      style={{ '--i': String(index) } as React.CSSProperties}
    >
      <div className="product-thumb">
        <div className={`product-thumb-img ${flags.finishClass}`}>
          <div className="logo-mock" />
        </div>
      </div>
      <div className="product-info">
        <div className="product-info-top">
          <span className="product-name">{product.name.trim()}</span>
          {flags.isBestseller && <span className="badge badge-accent">Bestseller</span>}
          {flags.isPremium && !flags.isBestseller && <span className="badge badge-info">Premium</span>}
          {flags.isEco && <span className="badge badge-success">Eco</span>}
        </div>
        <div className="product-desc">
          Catégorie : <strong>{product.category}</strong> · SKU{' '}
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{product.sku}</code>
        </div>
        <div className="product-specs">
          <span className="product-spec">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            {DELIVERY_WINDOW}
          </span>
          <span className="product-spec">📦 ID #{product.id}</span>
        </div>
      </div>
      <div className="product-price">
        <span className="product-price-label">À partir de</span>
        <span className="product-price-value">Voir prix →</span>
        <span className="product-price-unit">Configure pour devis</span>
        <span className="product-cta">Configurer →</span>
      </div>
    </Link>
  );
}
