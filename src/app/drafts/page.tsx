/**
 * /drafts — Server Component listant les DesignDraft non finalisés du user.
 *
 * Un DesignDraft est une instance customisée d'un Template — c'est ce qui sert
 * de "brouillon" pour le wizard `/design/[slug]`.
 *
 * Définition d'un brouillon REPRENABLE = design finalisé (a des `values` + un
 * `finalPdfUrl`) mais pas encore transformé en commande → `orderId` null. (Le
 * draft n'est persisté qu'au clic « Commander » via /api/designs/finalize ; il
 * n'y a pas d'autosave en cours d'édition. Filtrer sur `finalPdfUrl: null` ne
 * matchait donc JAMAIS rien → liste vide. On filtre sur `orderId: null`.)
 *
 * Auth requise : middleware redirige déjà mais on garde un fallback explicite.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import { Icon } from '@/components/ui/Icon';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { formatRelative } from '@/lib/format';

export const metadata = { title: 'Brouillons' };

export const dynamic = 'force-dynamic';

export default async function DraftsPage() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in?callbackUrl=/drafts' as Route);

  const drafts = await prisma.designDraft.findMany({
    where: { userId: session.user.id, orderId: null },
    orderBy: { updatedAt: 'desc' },
    include: {
      template: { select: { slug: true, name: true, productType: true, variant: true } },
    },
    take: 50,
  });

  return (
    <div className="acct-shell">
      <Sidebar active="/drafts" />

      <main className="acct-main">
        <div className="page-header">
          <div>
            <h1 className="page-title">Brouillons</h1>
            <p className="page-subtitle">
              {drafts.length === 0 ? (
                <>Aucun brouillon en cours. Crée un design depuis nos templates.</>
              ) : (
                <>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {drafts.length} {drafts.length > 1 ? 'designs' : 'design'}
                  </strong>{' '}
                  en cours · finalisés mais pas encore commandés
                </>
              )}
            </p>
          </div>
        </div>

        {drafts.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="draft-info-banner">
              <span className="draft-info-banner-icon"><Icon name="save" /></span>
              <span>
                Chaque design que tu finalises est conservé ici tant que tu ne l'as
                pas commandé. Clique « Continuer » pour rouvrir le wizard avec tes
                valeurs et passer commande.
              </span>
            </div>

            <div className="drafts-grid">
              {drafts.map((draft) => (
                <Link
                  key={draft.id}
                  href={`/design/${draft.template.slug}?draftId=${draft.id}` as Route}
                  className="draft-card"
                >
                  <div className="draft-thumb">
                    <div className="draft-thumb-card matte"></div>
                  </div>
                  <div className="draft-info">
                    <div className="draft-info-top">
                      <span className="draft-name">{draft.template.name}</span>
                    </div>
                    <div className="draft-meta">
                      {draft.template.productType} · {draft.template.variant}
                    </div>
                    <div className="draft-time">
                      Modifié <strong>{formatRelative(draft.updatedAt)}</strong>
                    </div>
                  </div>
                  <div className="draft-actions">
                    <span className="draft-resume">Continuer →</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        gap: 16,
        padding: '96px 24px',
        background: 'var(--bg-surface)',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--r-xl)',
        textAlign: 'center',
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <div><Icon name="file" size={44} /></div>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          letterSpacing: '-0.01em',
          fontWeight: 400,
          margin: 0,
        }}
      >
        Pas de brouillon.
      </h2>
      {/* finding [58]/[117] — contredisait le commentaire du haut de ce
          fichier : il n'y a PAS d'autosave en cours d'édition, le brouillon
          n'est persisté qu'au clic « Commander » (/api/designs/finalize). */}
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 320 }}>
        Crée un design depuis nos templates — il apparaîtra ici une fois que tu
        cliques « Commander », pour reprendre plus tard si tu n&apos;as pas
        terminé.
      </p>
      <Link
        href={'/templates' as Route}
        className="btn btn-primary"
        style={{ marginTop: 8 }}
      >
        Voir les templates →
      </Link>
    </div>
  );
}
