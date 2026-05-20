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
import ExportImportActions from './ExportImportActions';

export const metadata = { title: 'Configurations sauvées — Plio' };
export const dynamic = 'force-dynamic';

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; tag?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/sign-in?callbackUrl=/account/favorites' as Route);
  }

  const sp = await searchParams;
  const filterFolder = sp.folder?.toLowerCase().trim();
  const filterTag = sp.tag?.toLowerCase().trim();

  // Pull all configs (cap 100), filter folder côté DB ; tags filter en JS
  // (parce que CSV — pas optimisé pour SQL search, mais < 100 rows c'est OK).
  const where: { userId: string; folder?: string | null } = {
    userId: session.user.id,
  };
  if (filterFolder === '__no-folder__') where.folder = null;
  else if (filterFolder) where.folder = filterFolder;

  const allConfigs = await prisma.savedConfig.findMany({
    where: { userId: session.user.id },
    orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 100,
  });

  // Distinct folders (pour les chips) + distinct tags
  const folders = Array.from(new Set(allConfigs.map((c) => c.folder).filter((f): f is string => !!f))).sort();
  const tagSet = new Set<string>();
  for (const c of allConfigs) {
    if (c.tags) c.tags.split(',').forEach((t) => tagSet.add(t.trim()));
  }
  const allTags = Array.from(tagSet).filter(Boolean).sort();

  // Apply filters
  let configs = allConfigs;
  if (filterFolder === '__no-folder__') configs = configs.filter((c) => !c.folder);
  else if (filterFolder) configs = configs.filter((c) => c.folder === filterFolder);
  if (filterTag) configs = configs.filter((c) => c.tags?.split(',').map((t) => t.trim()).includes(filterTag));

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ExportImportActions />
            <Link href={'/order/start' as Route} className="btn btn-primary">
              + Nouvelle commande
            </Link>
          </div>
        </header>

        {/* Round 18 #2 — folder + tag filter chips */}
        {(folders.length > 0 || allTags.length > 0) && (
          <div style={{ marginBottom: 20, display: 'grid', gap: 10 }}>
            {folders.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                  📁 Dossiers
                </span>
                <FolderChip href={'/account/favorites' as Route} active={!filterFolder} label={`Tous (${allConfigs.length})`} />
                {folders.map((f) => {
                  const count = allConfigs.filter((c) => c.folder === f).length;
                  return (
                    <FolderChip
                      key={f}
                      href={`/account/favorites?folder=${encodeURIComponent(f)}` as Route}
                      active={filterFolder === f}
                      label={`${f} (${count})`}
                    />
                  );
                })}
                {allConfigs.some((c) => !c.folder) && (
                  <FolderChip
                    href={'/account/favorites?folder=__no-folder__' as Route}
                    active={filterFolder === '__no-folder__'}
                    label={`Sans dossier (${allConfigs.filter((c) => !c.folder).length})`}
                    muted
                  />
                )}
              </div>
            )}
            {allTags.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                  🏷 Tags
                </span>
                {allTags.map((t) => (
                  <Link
                    key={t}
                    href={`/account/favorites?tag=${encodeURIComponent(t)}` as Route}
                    style={{
                      padding: '2px 10px',
                      fontSize: 12,
                      borderRadius: 'var(--r-pill)',
                      background: filterTag === t ? 'var(--accent-primary)' : 'var(--bg-sunken)',
                      color: filterTag === t ? '#fff' : 'var(--text-secondary)',
                      textDecoration: 'none',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    #{t}
                  </Link>
                ))}
                {filterTag && (
                  <Link href={'/account/favorites' as Route} style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline' }}>
                    × Retirer filter
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

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
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
                    <span>Créée {formatDateTime(c.createdAt.toISOString())}</span>
                    {c.lastUsedAt && (
                      <span>· Dernière utilisation {formatDateTime(c.lastUsedAt.toISOString())}</span>
                    )}
                    {c.timesUsed > 0 && (
                      <span>· {c.timesUsed} commande{c.timesUsed > 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {/* Round 18 #2 — badges folder + tags */}
                  {(c.folder || c.tags) && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.folder && (
                        <span style={{ padding: '2px 8px', fontSize: 11, background: 'var(--accent-soft)', color: 'var(--accent-primary)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-mono)' }}>
                          📁 {c.folder}
                        </span>
                      )}
                      {c.tags?.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                        <span key={t} style={{ padding: '2px 8px', fontSize: 11, background: 'var(--bg-sunken)', color: 'var(--text-secondary)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--font-mono)' }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <FavoriteActions
                  id={c.id}
                  name={c.name}
                  folder={c.folder}
                  tags={c.tags}
                  existingFolders={folders}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FolderChip({ href, active, label, muted }: { href: Route; active: boolean; label: string; muted?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        borderRadius: 'var(--r-pill)',
        background: active ? 'var(--accent-primary)' : muted ? 'transparent' : 'var(--bg-sunken)',
        color: active ? '#fff' : muted ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: 'none',
        border: muted ? '1px dashed var(--border-default)' : 'none',
      }}
    >
      {label}
    </Link>
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
