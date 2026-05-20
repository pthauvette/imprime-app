/**
 * /wallet — Portefeuille customer : crédit de parrainage actuel +
 * historique des récompenses gagnées + log des utilisations.
 *
 * Data sources (pas de table Wallet dédiée, on reconstitue) :
 *   - User.referralCreditCents (solde courant)
 *   - ReferralReward where referrerId=me (récompenses gagnées)
 *   - Order où referralCreditAppliedCents > 0 (utilisations)
 *
 * Pour l'instant, pas de crédit prépayé (top-up Stripe Customer balance
 * arrivera post-MVP). Pour MVP, le wallet ≡ crédit parrainage uniquement.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import WalletTopupForm from '@/components/account/WalletTopupForm';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/format';

export const metadata = { title: 'Portefeuille — Plio' };
export const dynamic = 'force-dynamic';

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ topup?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in?callbackUrl=/wallet' as Route);
  const userId = session.user.id;
  const sp = await searchParams;
  const topupStatus = sp.topup; // 'success' | 'cancelled' | undefined

  const [user, rewardsEarned, rewardsReceived, ordersWithCredit] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      // Round 18 #1 — walletCents (prepaid topup)
      select: { referralCode: true, referralCreditCents: true, walletCents: true },
    }),
    prisma.referralReward.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        referee: { select: { email: true, firstName: true } },
      },
    }),
    prisma.referralReward.findUnique({
      where: { refereeUserId: userId },
      include: {
        referrer: { select: { email: true } },
      },
    }),
    prisma.order.findMany({
      where: {
        userId,
        referralCreditAppliedCents: { gt: 0 },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        referralCreditAppliedCents: true,
        sinaliteOrderId: true,
      },
    }),
  ]);

  if (!user) redirect('/sign-in' as Route);

  // Aggregates
  const totalEarnedCents = rewardsEarned
    .filter((r) => r.status === 'CREDITED')
    .reduce((sum, r) => sum + r.creditCents, 0);
  const totalUsedCents = ordersWithCredit.reduce((sum, o) => sum + o.referralCreditAppliedCents, 0);
  const pendingCount = rewardsEarned.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="acct-shell">
      <Sidebar active="/wallet" />

      <main style={{ padding: '40px 48px 80px', maxWidth: 960 }}>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 400, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Portefeuille
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>
            Crédit de parrainage gagné + utilisations. Le crédit est appliqué
            automatiquement à ton prochain checkout.
          </p>
        </header>

        {/* Topup status banner */}
        {topupStatus === 'success' && (
          <div role="status" style={{
            padding: 16,
            marginBottom: 24,
            background: 'var(--success-soft, #f0fdf4)',
            border: '1px solid var(--success, #16a34a)',
            borderRadius: 'var(--r-md)',
            color: 'var(--success, #16a34a)',
            fontSize: 14,
            fontWeight: 500,
          }}>
            ✓ Top-up confirmé. Le crédit apparaîtra dans ton solde dans quelques secondes
            (synchronisation Stripe webhook).
          </div>
        )}
        {topupStatus === 'cancelled' && (
          <div role="status" style={{
            padding: 16,
            marginBottom: 24,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-md)',
            color: 'var(--text-secondary)',
            fontSize: 14,
          }}>
            Top-up annulé — aucun montant prélevé.
          </div>
        )}

        {/* Balance card */}
        <section
          style={{
            padding: 32,
            background: 'var(--accent-primary)',
            color: '#fff',
            borderRadius: 'var(--r-xl)',
            marginBottom: 24,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'center',
            gap: 32,
          }}
        >
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.85, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
              Solde total disponible
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.025em' }}>
              {formatCurrency((user.walletCents + user.referralCreditCents) / 100)}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {user.walletCents > 0 && (
                <span>💳 Prépayé : {formatCurrency(user.walletCents / 100)}</span>
              )}
              {user.referralCreditCents > 0 && (
                <span>🎁 Parrainage : {formatCurrency(user.referralCreditCents / 100)}</span>
              )}
              {user.walletCents === 0 && user.referralCreditCents === 0 && (
                <span>Pas encore de crédit — recharge ton wallet ou parraine un ami.</span>
              )}
            </div>
          </div>
          {user.referralCode && (
            <Link
              href={'/account/referrals' as Route}
              style={{
                padding: '12px 18px',
                background: '#fff',
                color: 'var(--accent-primary)',
                borderRadius: 'var(--r-pill)',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              🎁 Parrainer un ami
            </Link>
          )}
        </section>

        {/* Top-up form (Round 18 #1) */}
        <WalletTopupForm />

        {/* Stats */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
          <StatBox label="Gagné total" value={formatCurrency(totalEarnedCents / 100)} hint={`${rewardsEarned.filter((r) => r.status === 'CREDITED').length} parrainage${rewardsEarned.filter((r) => r.status === 'CREDITED').length > 1 ? 's' : ''} récompensés`} />
          <StatBox label="Utilisé total" value={formatCurrency(totalUsedCents / 100)} hint={`${ordersWithCredit.length} commande${ordersWithCredit.length > 1 ? 's' : ''}`} />
          {pendingCount > 0 && (
            <StatBox label="En attente" value={`${pendingCount}`} hint="Parrainage non encore commandé" accent="warning" />
          )}
        </section>

        {/* If the user themselves was referred — show that */}
        {rewardsReceived && (
          <section
            style={{
              padding: 20,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-lg)',
              marginBottom: 24,
            }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
              🎁 Tu as été parrainé par
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
              <strong>{rewardsReceived.referrer.email}</strong> — tu as reçu{' '}
              <strong style={{ color: 'var(--accent-primary)' }}>{formatCurrency(rewardsReceived.creditCents / 100)}</strong> de crédit{' '}
              {rewardsReceived.status === 'CREDITED'
                ? `créditté le ${formatDate((rewardsReceived.creditedAt ?? rewardsReceived.createdAt).toISOString())}`
                : '(en attente de ta 1ère commande payée)'}.
            </div>
          </section>
        )}

        {/* History grid : rewards earned + uses */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <section>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 12px' }}>
              Récompenses gagnées
            </h2>
            <div
              style={{
                padding: 0,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-lg)',
                overflow: 'hidden',
              }}
            >
              {rewardsEarned.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucune récompense pour l&apos;instant. Partage ton code pour commencer.
                </div>
              ) : (
                rewardsEarned.map((r, i) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '14px 16px',
                      borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {r.referee.firstName ?? r.referee.email.split('@')[0]}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {formatDate(r.createdAt.toISOString())} ·{' '}
                        <span style={{ color: r.status === 'CREDITED' ? 'var(--success, #16a34a)' : r.status === 'PENDING' ? '#D97706' : 'var(--danger)' }}>
                          {r.status === 'CREDITED' ? 'crédité' : r.status === 'PENDING' ? 'en attente' : r.status.toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: r.status === 'CREDITED' ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                      +{formatCurrency(r.creditCents / 100)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 12px' }}>
              Utilisations
            </h2>
            <div
              style={{
                padding: 0,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-lg)',
                overflow: 'hidden',
              }}
            >
              {ordersWithCredit.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucun crédit utilisé. Il sera appliqué automatiquement à ton prochain achat.
                </div>
              ) : (
                ordersWithCredit.map((o, i) => {
                  const ref = o.sinaliteOrderId ?? o.id.slice(-6).toUpperCase();
                  return (
                    <Link
                      key={o.id}
                      href={`/orders/${o.id}` as Route}
                      style={{
                        padding: '14px 16px',
                        borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 12,
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
                          #{ref}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {formatDate(o.createdAt.toISOString())}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--danger)' }}>
                        −{formatCurrency(o.referralCreditAppliedCents / 100)}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 32 }}>
          💡 Pour l&apos;instant, le portefeuille = crédit de parrainage uniquement.
          Les crédits prépayés (top-up Stripe Customer balance) arrivent post-MVP.
        </p>
      </main>
    </div>
  );
}

function StatBox({
  label, value, hint, accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'warning';
}) {
  return (
    <div
      style={{
        padding: 18,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: accent === 'warning' ? '#D97706' : 'var(--text-primary)', fontWeight: 400, lineHeight: 1.1 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
