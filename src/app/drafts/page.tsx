/**
 * /drafts — Server Component listant les DesignDraft non finalisés du user.
 *
 * Un DesignDraft est une instance customisée d'un Template — c'est ce qui sert
 * de "brouillon" pour le wizard `/design/[slug]`. Quand `finalPdfUrl` est null,
 * le user n'a pas encore committé son design (donc c'est un brouillon en cours).
 *
 * Auth requise : middleware redirige déjà mais on garde un fallback explicite.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { formatRelative } from '@/lib/format';

export const metadata = { title: 'Brouillons — Plio' };

export const dynamic = 'force-dynamic';

export default async function DraftsPage() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in?callbackUrl=/drafts' as Route);

  const drafts = await prisma.designDraft.findMany({
    where: { userId: session.user.id, finalPdfUrl: null },
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
                  en cours · sauvegardés automatiquement à chaque modification
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
              <span className="draft-info-banner-icon">💾</span>
              <span>
                Tes brouillons sont sauvegardés à chaque clic dans le wizard. Reprends
                exactement où tu en étais — toutes tes options et fichiers sont conservés.
              </span>
            </div>

            <div className="drafts-grid">
              {drafts.map((draft) => (
                <Link
                  key={draft.id}
                  href={`/design/${draft.template.slug}` as Route}
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
      <div style={{ fontSize: 48 }}>📝</div>
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
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 320 }}>
        Crée un design depuis nos templates — tes modifications sont sauvegardées au fur
        et à mesure.
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
