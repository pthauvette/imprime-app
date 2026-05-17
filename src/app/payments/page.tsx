/**
 * /payments — Server Component listant les paiements passés du user.
 *
 * On lit la table Order et on filtre sur `paidAt IS NOT NULL` (donc Stripe a
 * confirmé). On expose à l'utilisateur un lien vers /orders/[id] plutôt que
 * vers le dashboard Stripe (qui n'est accessible qu'aux admins).
 *
 * Pas de Refund/Wallet/Invoice séparés pour MVP — un paiement = un Order.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/format';

export const metadata = { title: 'Paiements — Plio' };

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  PAID: 'Payée',
  SUBMITTED: 'Envoyée',
  IN_PRODUCTION: 'En production',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  FAILED: 'Échouée',
};

export default async function PaymentsPage() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in?callbackUrl=/payments' as Route);

  const payments = await prisma.order.findMany({
    where: { userId: session.user.id, paidAt: { not: null } },
    orderBy: { paidAt: 'desc' },
    take: 50,
    select: {
      id: true,
      sinaliteOrderId: true,
      paidAt: true,
      amountCents: true,
      status: true,
      productSummary: true,
    },
  });

  const totalPaid =
    payments.reduce((sum, p) => sum + p.amountCents, 0) / 100;

  return (
    <div className="acct-shell">
      <Sidebar active="/payments" />

      <main className="acct-main">
        <h1 className="page-title">Paiements</h1>
        <p className="page-subtitle">
          {payments.length === 0 ? (
            <>Aucun paiement encore.</>
          ) : (
            <>
              <strong style={{ color: 'var(--text-primary)' }}>
                {payments.length} {payments.length > 1 ? 'paiements' : 'paiement'}
              </strong>{' '}
              · {formatCurrency(totalPaid)} payés au total · sécurisé par Stripe
            </>
          )}
        </p>

        {payments.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Historique</h2>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                50 derniers
              </span>
            </div>
            <div className="tx-list">
              {payments.map((p) => {
                const displayId = p.sinaliteOrderId
                  ? `#SIN-${p.sinaliteOrderId}`
                  : `#${p.id.slice(-6).toUpperCase()}`;
                return (
                  <Link
                    key={p.id}
                    href={`/orders/${p.id}` as Route}
                    className="tx-row"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="tx-icon charge">→</div>
                    <div className="tx-info">
                      <div className="tx-title">
                        Commande {displayId}
                        {p.productSummary ? ` — ${p.productSummary}` : ''}
                      </div>
                      <div className="tx-meta">
                        {STATUS_LABELS[p.status] ?? p.status}
                      </div>
                    </div>
                    <div className="tx-date">
                      {p.paidAt ? formatDate(p.paidAt) : ''}
                    </div>
                    <div className="tx-amount out">
                      {formatCurrency(p.amountCents / 100)}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
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
      <div style={{ fontSize: 48 }}>💳</div>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          letterSpacing: '-0.01em',
          fontWeight: 400,
          margin: 0,
        }}
      >
        Aucun paiement encore.
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 380 }}>
        Tes commandes payées apparaîtront ici avec leur statut et leur montant.
      </p>
      <Link
        href={'/order/start' as Route}
        className="btn btn-primary"
        style={{ marginTop: 8 }}
      >
        Démarrer une commande →
      </Link>
    </div>
  );
}
