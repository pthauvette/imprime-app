/**
 * /admin/products — Catalogue Sinalite live (via API).
 *
 * Fetch direct depuis sinalite.listProducts() (cached côté client lib).
 * Filtrage par catégorie + search via searchParams. Plus de cache health
 * stats que dans le mock — on garde simple : compteur produits enabled,
 * dernière sync, list paginée.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { sinalite, SinaliteError } from '@/lib/sinalite/client';
import { fetchOverridesMap } from '@/lib/products/overrides';
import AdminSidebar from '@/components/admin/AdminSidebar';
import ProductOverrideActions from './ProductOverrideActions';

export const metadata = { title: 'Admin — Catalogue Sinalite' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface SP {
  category?: string;
  q?: string;
  page?: string;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { session } = await requireAdminPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const filterCategory = sp.category ?? null;
  const search = (sp.q ?? '').trim().toLowerCase();

  // Fetch products + sidebar counts in parallel (+ overrides admin pour
  // afficher l'état hidden/featured/renommé sur chaque ligne du tableau).
  const [products, ordersCount, usersCount, syncedAt, overridesMap, cacheStats] = await Promise.all([
    sinalite.listProducts().catch((e: unknown) => {
      const err = e instanceof SinaliteError ? e.message : (e as Error).message;
      return { __error: err };
    }),
    prisma.order.count(),
    prisma.user.count(),
    // We don't store a "last synced" timestamp — use now (approximation)
    Promise.resolve(new Date()),
    fetchOverridesMap(),
    // Round 23 #3 — Sinalite cache stats
    fetchCacheStats(),
  ]);

  // Handle Sinalite API failure gracefully
  if (typeof products === 'object' && products !== null && '__error' in products) {
    return (
      <ErrorState
        sidebar={
          <AdminSidebar
            active="products"
            user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
          />
        }
        error={(products as { __error: string }).__error}
      />
    );
  }

  const allProducts = products as Awaited<ReturnType<typeof sinalite.listProducts>>;
  const enabledProducts = allProducts.filter((p) => p.enabled === 1);

  // Category counts
  const byCategory = new Map<string, number>();
  for (const p of enabledProducts) {
    byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);
  }
  const categories = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Filter for the table
  let filtered = enabledProducts;
  if (filterCategory) filtered = filtered.filter((p) => p.category === filterCategory);
  if (search) {
    filtered = filtered.filter(
      (p) => p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search) || String(p.id).includes(search),
    );
  }

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageProducts = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="products"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Catalogue Sinalite</h1>
            <p className="adm-page-subtitle">
              {enabledProducts.length} produit{enabledProducts.length > 1 ? 's' : ''} actif{enabledProducts.length > 1 ? 's' : ''} · {categories.length} catégorie{categories.length > 1 ? 's' : ''} · {allProducts.length - enabledProducts.length} disabled
            </p>
          </div>
          <div className="adm-topbar-actions">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
              Sync : {syncedAt.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </header>

        {/* Info banner */}
        <div
          style={{
            padding: '14px 18px',
            background: 'var(--info-soft)',
            border: '1px solid var(--info)',
            borderRadius: 'var(--r-md)',
            fontSize: 13,
            color: 'var(--text-primary)',
            marginBottom: 24,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <span>ℹ️</span>
          <span>
            <strong>Source live</strong> : <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>GET /products/en_ca</code> via le token Sinalite cached.
            Le variants-index (pricing combos) est fetch on-demand par produit lors d'un order — pas affiché ici.
          </span>
        </div>

        {/* Round 23 #3 — Sinalite cache stats (write-through cache) */}
        {cacheStats && (
          <details
            style={{
              padding: '14px 18px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)',
              fontSize: 13,
              marginBottom: 24,
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
              💾 Cache Sinalite — {cacheStats.totalEntries} entries
              {cacheStats.avgAgeHours !== null && (
                <span style={{ marginLeft: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                  · âge moyen {cacheStats.avgAgeHours.toFixed(1)}h
                </span>
              )}
            </summary>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Entries totales</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{cacheStats.totalEntries}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Âge moyen</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{cacheStats.avgAgeHours?.toFixed(1) ?? '—'} h</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Entry la plus vieille</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {cacheStats.oldestAgeHours !== null
                    ? cacheStats.oldestAgeHours < 24
                      ? `${cacheStats.oldestAgeHours.toFixed(1)} h`
                      : `${(cacheStats.oldestAgeHours / 24).toFixed(1)} j`
                    : '—'}
                </div>
                {cacheStats.oldestKey && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, wordBreak: 'break-all' }}>
                    {cacheStats.oldestKey}
                  </div>
                )}
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Dernier refresh</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {cacheStats.newestUpdatedAt
                    ? cacheStats.newestUpdatedAt.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </div>
              </div>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}>
                Sample keys ({cacheStats.sampleKeys.length})
              </summary>
              <ul style={{ marginTop: 8, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', paddingLeft: 20 }}>
                {cacheStats.sampleKeys.map((k) => (
                  <li key={k} style={{ wordBreak: 'break-all', marginBottom: 4 }}>{k}</li>
                ))}
              </ul>
            </details>
          </details>
        )}

        {/* Category pills */}
        <div className="adm-pills" style={{ marginBottom: 24, flexWrap: 'wrap', maxWidth: '100%' }}>
          <Link
            href={'/admin/products' as Route}
            className={`adm-pill${!filterCategory ? ' active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            Tous <span className="adm-pill-count">{enabledProducts.length}</span>
          </Link>
          {categories.map(([cat, count]) => {
            const href = `/admin/products?category=${encodeURIComponent(cat)}`;
            return (
              <Link
                key={cat}
                href={href as Route}
                className={`adm-pill${filterCategory === cat ? ' active' : ''}`}
                style={{ textDecoration: 'none' }}
              >
                {cat} <span className="adm-pill-count">{count}</span>
              </Link>
            );
          })}
        </div>

        {/* Search */}
        <form
          action="/admin/products"
          method="get"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-pill)',
            padding: '0 24px 0 48px',
            height: 48,
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            marginBottom: 24,
          }}
        >
          {filterCategory && <input type="hidden" name="category" value={filterCategory} />}
          <svg
            style={{ position: 'absolute', left: 18, width: 18, height: 18, color: 'var(--text-muted)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx={11} cy={11} r={7} />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder="Cherche par nom, SKU ou ID Sinalite…"
            style={{ flex: 1, border: 0, background: 'transparent', font: 'inherit', color: 'var(--text-primary)', outline: 'none', fontSize: 14 }}
          />
        </form>

        {/* Products table */}
        <section
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg)',
            overflow: 'hidden',
          }}
        >
          {pageProducts.length === 0 ? (
            <div style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 8px', color: 'var(--text-primary)', fontWeight: 400 }}>
                Aucun produit
              </h2>
              <p style={{ fontSize: 14, margin: 0 }}>Ajuste tes filtres ou recharge la sync.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: 'var(--bg-sunken)' }}>
                <tr>
                  <th style={th}>ID</th>
                  <th style={th}>SKU</th>
                  <th style={{ ...th, width: '32%' }}>Nom</th>
                  <th style={th}>Catégorie</th>
                  <th style={th}>Sinalite</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions admin</th>
                </tr>
              </thead>
              <tbody>
                {pageProducts.map((p) => {
                  const ov = overridesMap.get(p.id) ?? null;
                  const displayName = ov?.displayName ?? p.name;
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderTop: '1px solid var(--border-subtle)',
                        background: ov?.disabled ? 'var(--danger-soft)' : undefined,
                        opacity: ov?.disabled ? 0.7 : 1,
                      }}
                    >
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{p.id}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{p.sku}</td>
                      <td style={{ ...td, fontWeight: 500 }}>
                        {displayName}
                        {ov?.displayName && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                            ↳ original : {p.name}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <span className="badge badge-neutral">{p.category}</span>
                      </td>
                      <td style={td}>
                        {p.enabled === 1 ? (
                          <span style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
                            ✓ ENABLED
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em' }}>
                            ✕ DISABLED
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <ProductOverrideActions
                          productId={p.id}
                          productName={p.name}
                          override={ov ? { disabled: ov.disabled, featured: ov.featured, displayName: ov.displayName, marginPct: ov.marginPct } : null}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {totalCount > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              category={filterCategory}
              search={search}
            />
          )}
        </section>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: '12px 16px',
  color: 'var(--text-primary)',
};

/**
 * Round 23 #3 — Stats du cache Sinalite. Aggregate sur SinaliteCacheEntry.
 * Returns null si table absente ou empty (safe fallback).
 */
async function fetchCacheStats(): Promise<{
  totalEntries: number;
  oldestKey: string | null;
  oldestAgeHours: number | null;
  avgAgeHours: number | null;
  newestUpdatedAt: Date | null;
  sampleKeys: string[];
} | null> {
  try {
    const rows = await prisma.sinaliteCacheEntry.findMany({
      select: { key: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 100, // suffit pour stats — pas d'use case full scan
    });
    if (rows.length === 0) return null;
    const now = Date.now();
    const ages = rows.map((r) => (now - r.updatedAt.getTime()) / 3600_000); // hours
    const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
    const oldest = rows.reduce((a, b) => (a.updatedAt < b.updatedAt ? a : b));
    return {
      totalEntries: rows.length,
      oldestKey: oldest.key,
      oldestAgeHours: (now - oldest.updatedAt.getTime()) / 3600_000,
      avgAgeHours: avgAge,
      newestUpdatedAt: rows[0]?.updatedAt ?? null,
      sampleKeys: rows.slice(0, 5).map((r) => r.key),
    };
  } catch {
    return null;
  }
}

function Pagination({
  page, totalPages, totalCount, category, search,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  category: string | null;
  search: string;
}) {
  const buildHref = (p: number): Route => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (search) params.set('q', search);
    if (p > 1) params.set('page', String(p));
    return `/admin/products${params.toString() ? '?' + params.toString() : ''}` as Route;
  };

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderTop: '1px solid var(--border-subtle)', fontSize: 13 }}>
      <div>
        Affiché <strong>{from}–{to}</strong> sur <strong>{totalCount}</strong>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {page > 1 ? (
          <Link href={buildHref(page - 1)} style={{ padding: '6px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', textDecoration: 'none', color: 'inherit' }}>←</Link>
        ) : (
          <span style={{ padding: '6px 12px', opacity: 0.3 }}>←</span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          Page <strong>{page}</strong> sur {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={buildHref(page + 1)} style={{ padding: '6px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', textDecoration: 'none', color: 'inherit' }}>→</Link>
        ) : (
          <span style={{ padding: '6px 12px', opacity: 0.3 }}>→</span>
        )}
      </div>
    </div>
  );
}

function ErrorState({ sidebar, error }: { sidebar: React.ReactNode; error: string }) {
  return (
    <div className="adm-shell">
      {sidebar}
      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Catalogue Sinalite</h1>
            <p className="adm-page-subtitle">Erreur de fetch</p>
          </div>
        </header>
        <div
          style={{
            padding: 24,
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-lg)',
            color: 'var(--danger)',
          }}
        >
          <strong>Sinalite API a échoué :</strong> {error}
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            Vérifie SINALITE_CLIENT_ID et SINALITE_CLIENT_SECRET dans Amplify Console.
          </div>
        </div>
      </main>
    </div>
  );
}
