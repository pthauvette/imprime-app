/**
 * /account/wallet/history — historique complet des transactions wallet.
 *
 * Round 23 #1. Server Component. Pull WalletTransaction rows pour le
 * user courant, filter optionnel par kind, pagination 50/page.
 *
 * Use case : user fait un audit de son spending wallet, comprend pourquoi
 * son balance est X (vs juste voir l'aggregate sur /wallet).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { formatCurrency, formatDateTime } from '@/lib/format';

export const metadata = { title: 'Historique wallet — Plio' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 50;

type KindFilter = 'all' | 'TOPUP' | 'TOPUP_BONUS' | 'ORDER_SPEND' | 'REFUND' | 'EXPIRY' | 'ADMIN_ADJUSTMENT';

const KIND_META: Record<Exclude<KindFilter, 'all'>, { label: string; icon: string; color: string }> = {
  TOPUP:           { label: 'Top-up',         icon: '⬆',  color: 'var(--success, #16a34a)' },
  TOPUP_BONUS:     { label: 'Bonus tier',     icon: '🎁', color: 'var(--accent-primary)' },
  ORDER_SPEND:     { label: 'Order',          icon: '🛒', color: 'var(--text-secondary)' },
  REFUND:          { label: 'Remboursement',  icon: '↩',  color: 'var(--success, #16a34a)' },
  EXPIRY:          { label: 'Expiration',     icon: '⏰', color: 'var(--text-muted)' },
  ADMIN_ADJUSTMENT:{ label: 'Ajust. admin',   icon: '🔧', color: 'var(--warning, #D97706)' },
};

const KIND_ORDER: Array<Exclude<KindFilter, 'all'>> = [
  'TOPUP', 'TOPUP_BONUS', 'ORDER_SPEND', 'REFUND', 'EXPIRY', 'ADMIN_ADJUSTMENT',
];

export default async function WalletHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in?callbackUrl=/account/wallet/history' as Route);
  const userId = session.user.id;

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const kindFilter: KindFilter = (
    ['all', ...KIND_ORDER] as readonly string[]
  ).includes(sp.kind ?? 'all') ? (sp.kind as KindFilter) : 'all';

  // Where clause + count + page fetch en parallèle
  const where = {
    userId,
    ...(kindFilter !== 'all' && { kind: kindFilter }),
  };
  const [user, transactions, total, countsByKind] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { walletCents: true },
    }),
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.walletTransaction.count({ where }),
    // Group by kind pour les filter chip counts (sans le current filter)
    prisma.walletTransaction.groupBy({
      by: ['kind'],
      where: { userId },
      _count: { _all: true },
    }).catch(() => []),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const totalAllKinds = countsByKind.reduce((acc, c) => acc + c._count._all, 0);
  const countByKind = (k: string) => countsByKind.find((c) => c.kind === k)?._count._all ?? 0;

  return (
    <div className="acct-shell">
      <Sidebar active="/wallet" />

      <main style={{ padding: '40px 48px 80px', maxWidth: 960 }}>
        <nav style={{ marginBottom: 16, fontSize: 12 }}>
          <Link href={'/wallet' as Route} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
            ← Retour au wallet
          </Link>
        </nav>

        <header style={{ marginBottom: 32 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            fontWeight: 400,
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}>
            Historique wallet
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>
            Toutes tes transactions wallet — chaque crédit ou débit avec le solde après.
            Balance courante : <strong>{formatCurrency((user?.walletCents ?? 0) / 100)}</strong>
          </p>
        </header>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          <FilterChip href={'/account/wallet/history' as Route} active={kindFilter === 'all'} label={`Tous (${totalAllKinds})`} />
          {KIND_ORDER.map((k) => {
            const count = countByKind(k);
            if (count === 0) return null;
            const params = new URLSearchParams({ kind: k });
            return (
              <FilterChip
                key={k}
                href={`/account/wallet/history?${params.toString()}` as Route}
                active={kindFilter === k}
                label={`${KIND_META[k].icon} ${KIND_META[k].label} (${count})`}
              />
            );
          })}
        </div>

        {transactions.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-xl)',
              overflow: 'hidden',
            }}>
              {transactions.map((tx) => {
                const meta = KIND_META[tx.kind as Exclude<KindFilter, 'all'>] ?? { label: tx.kind, icon: '·', color: 'var(--text-muted)' };
                const isCredit = tx.amountCents > 0;
                return (
                  // Round 42 #1 — layout via .wallet-tx-row class (grid moved out of
                  // inline style so the mobile @media in migrated-pages.css can win).
                  // 5 children: icon / main / amount / balance / pdf.
                  <div
                    key={tx.id}
                    className="wallet-tx-row"
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span
                      className="wallet-tx-icon"
                      style={{
                        fontSize: 18,
                        color: meta.color,
                        width: 28,
                        textAlign: 'center',
                      }}
                      title={meta.label}
                    >
                      {meta.icon}
                    </span>
                    <div className="wallet-tx-main" style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {tx.description}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {formatDateTime(tx.createdAt.toISOString())}
                        {tx.orderId && (
                          <>
                            {' · '}
                            <Link href={`/orders/${tx.orderId}` as Route} style={{ color: 'var(--accent-primary)' }}>
                              Order #{tx.orderId.slice(-6).toUpperCase()}
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="wallet-tx-amount" style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 14,
                      fontWeight: 600,
                      color: isCredit ? 'var(--success, #16a34a)' : 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                    }}>
                      {isCredit ? '+' : ''}{formatCurrency(tx.amountCents / 100)}
                    </div>
                    <div className="wallet-tx-balance" style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}>
                      Solde : {formatCurrency(tx.balanceAfterCents / 100)}
                    </div>
                    {/* Round 24 #1 — PDF receipt download */}
                    <a
                      className="wallet-tx-pdf"
                      href={`/api/wallet/transactions/${tx.id}/receipt.pdf`}
                      download
                      title="Télécharger reçu PDF (audit comptable)"
                      style={{
                        fontSize: 11,
                        color: 'var(--accent-primary)',
                        textDecoration: 'none',
                        fontFamily: 'var(--font-mono)',
                        padding: '4px 8px',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--r-sm)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      📄 PDF
                    </a>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ marginTop: 20, display: 'flex', gap: 6, justifyContent: 'center' }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                  const params = new URLSearchParams();
                  if (kindFilter !== 'all') params.set('kind', kindFilter);
                  if (p > 1) params.set('page', String(p));
                  const href = `/account/wallet/history${params.toString() ? '?' + params.toString() : ''}` as Route;
                  return (
                    <Link
                      key={p}
                      href={href}
                      style={{
                        padding: '6px 12px',
                        background: p === page ? 'var(--accent-primary)' : 'var(--bg-surface)',
                        color: p === page ? '#fff' : 'var(--text-primary)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--r-sm)',
                        textDecoration: 'none',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                      }}
                    >
                      {p}
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: Route; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: '4px 10px',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        background: active ? 'var(--accent-primary)' : 'var(--bg-sunken)',
        color: active ? '#fff' : 'var(--text-secondary)',
        borderRadius: 'var(--r-pill)',
        textDecoration: 'none',
        fontWeight: active ? 700 : 500,
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
        padding: '48px 24px',
        background: 'var(--bg-surface)',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--r-xl)',
        textAlign: 'center',
        color: 'var(--text-muted)',
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 8 }}>💳</div>
      <p style={{ fontSize: 14, margin: '0 0 16px' }}>
        Pas de transaction wallet pour l&apos;instant. Recharge ton wallet pour commencer.
      </p>
      <Link
        href={'/wallet' as Route}
        style={{
          padding: '10px 18px',
          background: 'var(--accent-primary)',
          color: '#fff',
          borderRadius: 'var(--r-pill)',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Recharger →
      </Link>
    </div>
  );
}
