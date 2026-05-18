/**
 * /account/favorites — liste des configurations produit sauvegardées par
 * l'user. Chaque card permet de :
 *  - Cliquer "Utiliser" → POST /api/saved-configs/[id] qui retourne l'URL
 *    deep-link vers le wizard (pré-rempli) + bump timesUsed/lastUsedAt
 *  - Renommer (prompt simple)
 *  - Supprimer (avec confirm)
 *
 * Auth requise — middleware gate /account/* mais on re-vérifie ici (Next.js
 * Server Components ne sont pas affectés par le middleware skipping certains
 * matchers).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import FavoriteActions from './FavoriteActions';

export const metadata = { title: 'Configurations sauvées — Plio' };
export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/sign-in?callbackUrl=/account/favorites' as Route);
  }

  const configs = await prisma.savedConfig.findMany({
    where: { userId: session.user.id },
    orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 100,
  });

  return (
    <div className="acct-shell">
      <Sidebar active="/account/favorites" />

      <main className="acct-main">
        <header className="acct-header">
          <div>
            <h1 className="acct-page-title">Configurations sauvées</h1>
            <p className="acct-page-subtitle">
              {configs.length} configuration{configs.length > 1 ? 's' : ''} ·
              {' '}reprends d'un clic là où tu en étais.
            </p>
          </div>
          <Link href={'/order/start' as Route} className="btn btn-primary">
            + Nouvelle commande
          </Link>
        </header>

        {configs.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {configs.map((c) => (
              <div
                key={c.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-lg)',
                  padding: 20,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 16,
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {c.productName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                    {c.summary}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, display: 'flex', gap: 14, fontFamily: 'var(--font-mono)' }}>
                    <span>Créée {formatDateTime(c.createdAt.toISOString())}</span>
                    {c.lastUsedAt && (
                      <span>· Dernière utilisation {formatDateTime(c.lastUsedAt.toISOString())}</span>
                    )}
                    {c.timesUsed > 0 && (
                      <span>· {c.timesUsed} commande{c.timesUsed > 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
                <FavoriteActions id={c.id} name={c.name} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: '64px 32px',
        background: 'var(--bg-surface)',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--r-xl)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>★</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 8px', fontWeight: 400 }}>
        Aucune configuration sauvegardée
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 20px', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
        Quand tu configures un produit dans le wizard, clique sur « Sauvegarder » à l'étape Quantité.
        Tu pourras revenir ici pour relancer la même commande d'un seul clic.
      </p>
      <Link href={'/order/start' as Route} className="btn btn-primary">
        Démarrer une commande
      </Link>
    </div>
  );
}
