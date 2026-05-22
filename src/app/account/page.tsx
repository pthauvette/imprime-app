/**
 * /account — Dashboard customer.
 *
 * Vue d'ensemble de l'activité du user : LTV, commandes récentes, statut
 * parrainage (crédit dispo + count referrals), config sauvée la plus
 * récente, suggested re-order (last paid order).
 *
 * Pattern : Server Component, queries Prisma directement. Pas de hot path
 * — chargé 1x quand l'user atterrit sur /account.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import Sidebar from '@/components/account/Sidebar';
import ProductionStatusWidget from '@/components/account/ProductionStatusWidget';
import MonthlySpendChart from '@/components/account/MonthlySpendChart';
import NpsAutoPrompt from '@/components/account/NpsAutoPrompt';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  type LoyaltyTier,
  TIER_LABELS,
  TIER_PERKS,
  nextTierProgress,
} from '@/lib/customers/loyalty';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon compte · Plio' };

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'En attente', color: 'var(--text-muted)' },
  PAID: { label: 'Payée', color: 'var(--accent-primary)' },
  SUBMITTED: { label: 'Soumise', color: 'var(--accent-primary)' },
  IN_PRODUCTION: { label: 'En production', color: '#D97706' },
  SHIPPED: { label: 'Expédiée', color: '#2563EB' },
  DELIVERED: { label: 'Livrée', color: '#16A34A' },
  CANCELLED: { label: 'Annulée', color: 'var(--danger)' },
  FAILED: { label: 'Échec', color: 'var(--danger)' },
};

export default async function AccountDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/sign-in?callbackUrl=/account' as Route);
  }

  const userId = session.user.id;

  // Parallel fetch tout ce dont on a besoin
  // Round 23 #4 — 6 mois d'orders pour le chart (paidAt requis pour bucket)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  sixMonthsAgo.setDate(1); // bucket sur premier du mois

  const [user, recentOrders, ltvAgg, ltv365Agg, referralsCount, savedConfigsCount, lastSavedConfig, last6mOrders] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        name: true,
        loyaltyTier: true,
        email: true,
        referralCode: true,
        referralCreditCents: true,
        createdAt: true,
      },
    }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        paidAt: true, // Round 21 #3 — needed for ProductionStatusWidget
        status: true,
        amountCents: true,
        productSummary: true,
        itemsCount: true,
        sinaliteOrderId: true,
      },
    }),
    prisma.order.aggregate({
      where: { userId, status: { in: ['PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    // Revenu 365 derniers jours pour loyalty tier progress
    prisma.order.aggregate({
      where: {
        userId,
        paidAt: { gte: new Date(Date.now() - 365 * 24 * 3600 * 1000) },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      _sum: { amountCents: true },
    }),
    prisma.referralReward.count({ where: { referrerId: userId } }),
    prisma.savedConfig.count({ where: { userId } }),
    prisma.savedConfig.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, productName: true, updatedAt: true },
    }),
    // Round 23 #4 — 6m orders pour chart spending
    prisma.order.findMany({
      where: {
        userId,
        paidAt: { gte: sixMonthsAgo },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      select: { paidAt: true, amountCents: true },
    }).catch(() => []),
  ]);

  if (!user) redirect('/sign-in' as Route);

  // ─── NPS eligibility (Round 13 #2) ─────────────────────────────────────
  // On invite l'user à laisser un NPS quand :
  //   - Il a ≥1 order DELIVERED dont updatedAt ≥ 14 j
  //   - Aucun NpsResponse existant pour cet order
  // Le cookie de snooze "plus tard" est checké côté client (le SSR ne sait
  // pas par-user; alternative serait read cookies() ici, mais on garde le
  // best-effort côté client pour pas faire échouer le SSR si la table
  // NpsResponse n'est pas migrée localement).
  const npsCutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  let npsCandidate: { id: string; sinaliteOrderId: string | null } | null = null;
  try {
    const eligible = await prisma.order.findFirst({
      where: {
        userId,
        status: 'DELIVERED',
        updatedAt: { lte: npsCutoff },
        npsResponse: { is: null },
      },
      orderBy: { updatedAt: 'asc' }, // le plus ancien éligible = priorité
      select: { id: true, sinaliteOrderId: true },
    });
    npsCandidate = eligible ?? null;
  } catch {
    // Table NpsResponse pas migrée localement — pas grave, skip silencieux
    npsCandidate = null;
  }

  const greeting = user.firstName ?? user.name?.split(' ')[0] ?? user.email.split('@')[0];
  const ltvCents = ltvAgg._sum.amountCents ?? 0;
  const ltvLast365dCents = ltv365Agg._sum.amountCents ?? 0;
  const orderCount = ltvAgg._count._all;
  const referralUrl = user.referralCode
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca'}?ref=${user.referralCode}`
    : null;
  const lastPaidOrder = recentOrders.find((o) => o.status !== 'PENDING' && o.status !== 'CANCELLED' && o.status !== 'FAILED');

  return (
    <div className="acct-shell">
      <Sidebar active="/account" />

      {npsCandidate && (
        <NpsAutoPrompt
          orderId={npsCandidate.id}
          orderLabel={`ta commande #${npsCandidate.sinaliteOrderId ?? npsCandidate.id.slice(-6).toUpperCase()}`}
        />
      )}

      <main style={{ padding: '40px 48px 80px', maxWidth: 1200 }}>
        {/* Greeting */}
        <header style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
            {hourGreeting()}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px, 4vw, 52px)', letterSpacing: '-0.025em', margin: '4px 0 8px', fontWeight: 400, lineHeight: 1.1 }}>
            Bonjour, <em style={{ color: 'var(--accent-primary)' }}>{greeting}</em>.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0 }}>
            Bienvenue dans ton tableau de bord Plio.
          </p>
        </header>

        {/* Stats */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
          <StatCard label="Commandes" value={String(orderCount)} hint={orderCount > 0 ? 'au total' : 'à venir bientôt'} />
          <StatCard
            label="Total dépensé"
            value={formatCurrency(ltvCents / 100)}
            hint={orderCount > 1 ? `${formatCurrency(ltvCents / orderCount / 100)} en moyenne` : ''}
            highlight
          />
          {user.referralCreditCents > 0 && (
            <StatCard
              label="Crédit parrainage"
              value={formatCurrency(user.referralCreditCents / 100)}
              hint="Déduit au prochain checkout"
              highlight
              accent="success"
            />
          )}
          <StatCard
            label="Parrainages"
            value={String(referralsCount)}
            hint={referralUrl ? 'Partage ton code' : 'Active ton code'}
          />
          <LoyaltyCard tier={(user.loyaltyTier as 'BRONZE' | 'SILVER' | 'GOLD') ?? 'BRONZE'} revenueLast365dCents={ltvLast365dCents} />
        </section>

        {/* Round 21 #3 — In-production widget. Filter on existing recentOrders
            pour éviter une query supplémentaire. */}
        <ProductionStatusWidget
          orders={recentOrders.filter((o) =>
            ['PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED'].includes(o.status)
          )}
        />

        {/* Round 23 #4 — Monthly spend chart (6 derniers mois) */}
        <MonthlySpendChart orders={last6mOrders} />

        {/* Grid : Recent orders + Side widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* Recent orders */}
          <section
            style={{
              padding: 24,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-xl)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '-0.01em', margin: 0, fontWeight: 400 }}>
                Commandes récentes
              </h2>
              {orderCount > 5 && (
                <Link href={'/orders' as Route} style={{ fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Voir tout →
                </Link>
              )}
            </div>

            {recentOrders.length === 0 ? (
              <EmptyState />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {recentOrders.map((o) => {
                  const badge = STATUS_BADGES[o.status] ?? STATUS_BADGES.PENDING;
                  const displayId = o.sinaliteOrderId ? `#${o.sinaliteOrderId}` : `#${o.id.slice(-6).toUpperCase()}`;
                  return (
                    <Link
                      key={o.id}
                      href={`/orders/${o.id}` as Route}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        gap: 16,
                        padding: '14px 16px',
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--r-md)',
                        textDecoration: 'none',
                        color: 'inherit',
                        alignItems: 'center',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em', fontWeight: 600 }}>
                        {displayId}
                      </span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                          {o.productSummary ?? `${o.itemsCount} article${o.itemsCount > 1 ? 's' : ''}`}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {formatDate(o.createdAt.toISOString())} · <span style={{ color: badge.color, fontWeight: 600 }}>{badge.label}</span>
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatCurrency(o.amountCents / 100)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {recentOrders.length > 0 && lastPaidOrder && (
              <div style={{ marginTop: 16, padding: 16, background: 'var(--accent-soft)', borderRadius: 'var(--r-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Tu veux <strong>recommander la même chose</strong> que ta dernière commande ?
                </div>
                <Link
                  href={`/order/start?reorder=${lastPaidOrder.id}` as Route}
                  style={{
                    padding: '8px 14px',
                    background: 'var(--accent-primary)',
                    color: '#fff',
                    borderRadius: 'var(--r-pill)',
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ↻ Re-commander
                </Link>
              </div>
            )}
          </section>

          {/* Side widgets */}
          <aside style={{ display: 'grid', gap: 16, position: 'sticky', top: 24 }}>
            {/* New order quick action */}
            <Link
              href={'/order/start' as Route}
              style={{
                display: 'block',
                padding: 20,
                background: 'var(--accent-primary)',
                color: '#fff',
                borderRadius: 'var(--r-lg)',
                textDecoration: 'none',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.8, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
                Démarrer
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: '-0.01em', fontWeight: 400, marginBottom: 4 }}>
                Nouvelle commande →
              </div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Devis instantané en 2 minutes
              </div>
            </Link>

            {/* Saved config */}
            {lastSavedConfig && (
              <div style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
                  Dernière config sauvée
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                  {lastSavedConfig.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {lastSavedConfig.productName} · {formatDate(lastSavedConfig.updatedAt.toISOString())}
                </div>
                <Link
                  href={'/account/favorites' as Route}
                  style={{
                    fontSize: 12,
                    color: 'var(--accent-primary)',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  Voir mes {savedConfigsCount} config{savedConfigsCount > 1 ? 's' : ''} →
                </Link>
              </div>
            )}

            {/* Referral widget */}
            {referralUrl && (
              <div
                style={{
                  padding: 20,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-lg)',
                }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
                  🎁 Parrainage
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Invite tes contacts et reçois <strong>10 $ de crédit</strong> par première commande.
                </div>
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'var(--bg-sunken)',
                    borderRadius: 'var(--r-sm)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    wordBreak: 'break-all',
                    marginBottom: 10,
                  }}
                >
                  {user.referralCode}
                </div>
                <Link
                  href={'/account/referrals' as Route}
                  style={{ fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}
                >
                  Partager mon code →
                </Link>
              </div>
            )}

            {/* Help */}
            <div style={{ padding: 16, background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Une question ? On répond en moins de 4h ouvrables à{' '}
              <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>
                bonjour@plio.ca
              </a>{' '}
              ou via la <Link href={'/help' as Route} style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>section aide</Link>.
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label, value, hint, highlight, accent,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
  accent?: 'success';
}) {
  const valueColor =
    accent === 'success'
      ? '#16A34A'
      : highlight
        ? 'var(--accent-primary)'
        : 'var(--text-primary)';

  return (
    <div
      style={{
        padding: 20,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em', color: valueColor, fontWeight: 400, lineHeight: 1.1 }}>
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
      <p style={{ fontSize: 14, margin: '0 0 16px' }}>
        Aucune commande pour l&apos;instant.
      </p>
      <Link
        href={'/order/start' as Route}
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
        Démarrer une commande →
      </Link>
    </div>
  );
}

/**
 * LoyaltyCard — affiche le tier courant + progress vers next tier.
 *
 * Pattern : carte dense pour la rangée de stats. Pas de CTA — c'est de
 * l'info pure. Les perks complets sont visibles ailleurs (futur :
 * /account/loyalty page).
 */
function LoyaltyCard({
  tier,
  revenueLast365dCents,
}: {
  tier: LoyaltyTier;
  revenueLast365dCents: number;
}) {
  const progress = nextTierProgress({ revenueLast365dCents });
  const TIER_COLORS: Record<LoyaltyTier, string> = {
    BRONZE: '#B45309',
    SILVER: '#6B7280',
    GOLD: '#D97706',
  };
  const TIER_EMOJI: Record<LoyaltyTier, string> = {
    BRONZE: '🥉',
    SILVER: '🥈',
    GOLD: '🥇',
  };
  const perksPreview = TIER_PERKS[tier][0] ?? '';

  return (
    <div
      style={{
        padding: 20,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
        Statut fidélité
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          letterSpacing: '-0.02em',
          color: TIER_COLORS[tier],
          fontWeight: 400,
          lineHeight: 1.1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>{TIER_EMOJI[tier]}</span>
        <span>{TIER_LABELS[tier]}</span>
      </div>
      {progress.next && progress.needsCents !== null ? (
        <>
          <div
            style={{
              marginTop: 10,
              height: 6,
              background: 'var(--bg-sunken)',
              borderRadius: 999,
              overflow: 'hidden',
            }}
            aria-label={`Progression vers ${TIER_LABELS[progress.next]}`}
          >
            <div
              style={{
                width: `${progress.progressPct}%`,
                height: '100%',
                background: 'var(--accent-primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            +{formatCurrency(progress.needsCents / 100)} pour atteindre {TIER_LABELS[progress.next]}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          {perksPreview}
        </div>
      )}
    </div>
  );
}

function hourGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Tard dans la nuit';
  if (h < 12) return 'Bon matin';
  if (h < 17) return 'Bon après-midi';
  if (h < 21) return 'Bonsoir';
  return 'Bonne soirée';
}
