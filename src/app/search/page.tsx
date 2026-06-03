/**
 * /search?q= — page de recherche publique customer.
 *
 * Server Component qui rend la nav + délègue à SearchClient (input + live
 * fetch). Pré-fill via ?q= depuis le query string pour deep-links.
 */

import Link from 'next/link';
import type { Route } from 'next';
import SearchClient from './SearchClient';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Recherche',
  description: 'Trouve une réponse dans notre centre d\'aide et nos articles de blog.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;

  return (
    <>
      <nav className="mkt-nav">
        <Link href={'/' as Route} className="mkt-brand">Plio.</Link>
        <div className="mkt-nav-links">
          <Link href={'/order/start' as Route} className="mkt-nav-link">Produits</Link>
          <Link href={'/blog' as Route} className="mkt-nav-link">Blog</Link>
          <Link href={'/help' as Route} className="mkt-nav-link">Aide</Link>
          <Link href={'/contact' as Route} className="mkt-nav-link">Contact</Link>
        </div>
      </nav>

      <main style={{ padding: '60px 24px 80px', maxWidth: 800, margin: '0 auto' }}>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, margin: '0 0 12px', letterSpacing: '-0.025em' }}>
            Que <em style={{ color: 'var(--accent-primary)' }}>cherches-tu</em> ?
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Recherche dans le centre d&apos;aide + le blog Plio.
          </p>
        </header>

        <SearchClient initialQuery={q} />
      </main>
    </>
  );
}
