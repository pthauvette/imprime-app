/**
 * /addresses — Server Component listant le carnet d'adresses du user.
 *
 * MVP : lecture seule. Les Address rows sont indépendantes des snapshots
 * shipping dans Order (qui restent immutables pour l'historique). Pour
 * l'instant, on n'auto-save PAS d'Address depuis le checkout — donc la
 * plupart des users verront l'empty state, ce qui est OK pour MVP.
 *
 * Le CRUD UI (formulaires create/update/delete) arrivera dans un prochain
 * sprint — bouton d'ajout désactivé avec tooltip "UI à venir".
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export const metadata = { title: 'Adresses — Plio' };

export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in?callbackUrl=/addresses' as Route);

  const addresses = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });

  const shippingCount = addresses.filter((a) => a.kind === 'SHIPPING').length;
  const billingCount = addresses.filter((a) => a.kind === 'BILLING').length;

  return (
    <div className="acct-shell">
      <Sidebar active="/addresses" />

      <main className="acct-main">
        <div className="page-header">
          <div>
            <h1 className="page-title">Mes adresses</h1>
            <p className="page-subtitle">
              {addresses.length === 0 ? (
                <>Aucune adresse sauvegardée pour le moment.</>
              ) : (
                <>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {addresses.length} {addresses.length > 1 ? 'adresses' : 'adresse'}
                  </strong>{' '}
                  sauvegardées · {shippingCount} expédition · {billingCount} facturation
                </>
              )}
            </p>
          </div>
          <button
            className="page-action"
            disabled
            title="UI à venir"
            style={{
              opacity: 0.5,
              cursor: 'not-allowed',
              border: 'none',
            }}
          >
            + Ajouter une adresse
          </button>
        </div>

        {addresses.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="addr-grid">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className={`addr-card${addr.isDefault ? ' default' : ''}`}
              >
                <div className="addr-card-header">
                  <div className="addr-card-name">
                    <div className="addr-card-icon">
                      {addr.kind === 'BILLING' ? '📄' : '📦'}
                    </div>
                    <span className="addr-card-label">
                      {addr.label ?? (addr.kind === 'BILLING' ? 'Facturation' : 'Expédition')}
                    </span>
                  </div>
                  {addr.isDefault ? (
                    <span className="addr-card-default-pill">Défaut</span>
                  ) : (
                    <KindBadge kind={addr.kind} />
                  )}
                </div>
                <div className="addr-card-content">
                  <strong>
                    {addr.firstName} {addr.lastName}
                    {addr.company ? ` · ${addr.company}` : ''}
                  </strong>
                  <span>
                    {addr.line1}
                    {addr.line2 ? ` · ${addr.line2}` : ''}
                  </span>
                  <span>
                    {addr.city}, {addr.province} {addr.postalCode} · Canada
                  </span>
                  {addr.phone && <span className="phone">{addr.phone}</span>}
                </div>
                <div className="addr-card-meta">
                  <span className="addr-card-stat">
                    {addr.kind === 'BILLING'
                      ? 'Adresse de facturation'
                      : 'Adresse d’expédition'}
                  </span>
                  <div className="addr-card-actions">
                    <button
                      className="addr-action-btn"
                      disabled
                      title="UI à venir"
                      style={{ opacity: 0.5, cursor: 'not-allowed' }}
                    >
                      Modifier
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  const isBilling = kind === 'BILLING';
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: isBilling ? 'var(--info)' : 'var(--text-muted)',
        letterSpacing: '0.04em',
        padding: '3px 8px',
        background: isBilling ? 'var(--info-soft)' : 'var(--bg-sunken)',
        borderRadius: 'var(--r-pill)',
        textTransform: 'uppercase',
        fontWeight: 600,
      }}
    >
      {isBilling ? 'Facturation' : 'Expédition'}
    </span>
  );
}

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
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      <div style={{ fontSize: 48 }}>📮</div>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          letterSpacing: '-0.01em',
          fontWeight: 400,
          margin: 0,
        }}
      >
        Tu n'as pas encore d'adresse enregistrée.
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 420 }}>
        Les adresses que tu utilises au checkout apparaîtront ici automatiquement — tu
        pourras alors les réutiliser en un clic pour tes prochaines commandes.
      </p>
    </div>
  );
}
