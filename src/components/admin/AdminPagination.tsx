/**
 * AdminPagination — composant simple prev/next + page X/Y pour les
 * pages admin qui listent des rows avec un `take` + searchParams.page.
 *
 * Pattern :
 *   const page = Math.max(1, parseInt(searchParams.page ?? '1'));
 *   const PER_PAGE = 25;
 *   const [items, total] = await Promise.all([
 *     prisma.X.findMany({ skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
 *     prisma.X.count(),
 *   ]);
 *   ...
 *   <AdminPagination page={page} total={total} perPage={PER_PAGE}
 *     baseHref="/admin/messages" />
 *
 * Préserve les autres searchParams (status, q, etc.) via le prop
 * `extraParams` — chacun est appendé au hrefs prev/next.
 */

import Link from 'next/link';
import type { Route } from 'next';

interface AdminPaginationProps {
  page: number;
  total: number;
  perPage: number;
  baseHref: string;
  /** Préserve les autres searchParams (status, q, etc.) dans prev/next hrefs. */
  extraParams?: Record<string, string | undefined>;
}

export default function AdminPagination({
  page, total, perPage, baseHref, extraParams,
}: AdminPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (total <= perPage) return null; // pas besoin de pagination

  const buildHref = (p: number): string => {
    const params = new URLSearchParams();
    if (p > 1) params.set('page', String(p));
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v !== undefined && v !== '') params.set(k, v);
      }
    }
    const qs = params.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };

  const prev = page > 1 ? buildHref(page - 1) : null;
  const next = page < totalPages ? buildHref(page + 1) : null;
  const fromIdx = (page - 1) * perPage + 1;
  const toIdx = Math.min(page * perPage, total);

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 0',
        marginTop: 16,
        borderTop: '1px solid var(--border-subtle)',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.04em',
        color: 'var(--text-muted)',
      }}>
        {fromIdx}–{toIdx} sur {total} · page {page} / {totalPages}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {prev ? (
          <Link href={prev as Route} className="btn btn-secondary btn-sm" rel="prev">
            ← Précédent
          </Link>
        ) : (
          <span className="btn btn-secondary btn-sm" aria-disabled style={{ opacity: 0.4, pointerEvents: 'none' }}>
            ← Précédent
          </span>
        )}
        {next ? (
          <Link href={next as Route} className="btn btn-secondary btn-sm" rel="next">
            Suivant →
          </Link>
        ) : (
          <span className="btn btn-secondary btn-sm" aria-disabled style={{ opacity: 0.4, pointerEvents: 'none' }}>
            Suivant →
          </span>
        )}
      </div>
    </nav>
  );
}
