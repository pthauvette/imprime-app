/**
 * /account/referrals — page user pour son programme de parrainage.
 *
 * Affiche :
 *  - Le code unique de l'user (lazy-généré ici si pas encore)
 *  - URL de partage avec bouton "Copier"
 *  - Balance de crédit accumulé (déduit auto au prochain checkout)
 *  - Historique des reward (qui a été parrainé + status + montant)
 *  - Récap du programme (combien on donne aux 2 sides)
 *
 * Note : la route /referrals (sans /account) existe déjà dans le sidebar
 * comme placeholder ; on garde celle-ci sous /account/* pour cohérence
 * avec /account/favorites. Le sidebar pointera vers /account/referrals.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/account/Sidebar';
import { Icon } from '@/components/ui/Icon';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { ensureReferralCode, buildShareUrl, REFERRAL_REWARD_CENTS } from '@/lib/referrals/code';
import { getLeaderboard } from '@/lib/referrals/leaderboard';
import { formatCurrency, formatDate } from '@/lib/format';
import CopyButton from './CopyButton';

export const metadata = { title: 'Parrainage' };
export const dynamic = 'force-dynamic';

export default async function ReferralsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/sign-in?callbackUrl=/account/referrals' as Route);
  }

  // Lazy-generate referralCode si pas encore présent (1ère visite de cette page).
  let code: string | null = null;
  try {
    code = await ensureReferralCode(session.user.id);
  } catch {
    // Génération échouée (très rare) — on affiche un placeholder + retry button
  }

  const [user, rewards, leaderboard] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { referralCreditCents: true },
    }),
    prisma.referralReward.findMany({
      where: { referrerId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        referee: { select: { firstName: true, email: true } },
      },
    }),
    // Round 19 #2 — leaderboard top 5 + ma place si pas dans top
    getLeaderboard({ currentUserId: session.user.id, topN: 5 }).catch(() => ({ top: [], me: null })),
  ]);

  const balance = (user?.referralCreditCents ?? 0) / 100;
  const totalEarned = rewards.filter((r) => r.status === 'CREDITED').reduce((a, r) => a + r.creditCents, 0) / 100;
  const rewardPerSide = formatCurrency(REFERRAL_REWARD_CENTS / 100);
  const shareUrl = code ? buildShareUrl(code) : '';

  return (
    <div className="acct-shell">
      <Sidebar active="/account/referrals" />

      <main className="acct-main">
        <header className="acct-header">
          <div>
            <h1 className="acct-page-title">Parrainage</h1>
            <p className="acct-page-subtitle">
              Partage ton code, gagne <strong>{rewardPerSide}</strong> de crédit pour chaque ami qui passe sa 1<sup>ère</sup> commande.
            </p>
          </div>
        </header>

        {/* Stats du programme — Round 30 #4 : auto-fit pour que les 3 cards
            ne se squeezent pas sous 360px (1 col stack mobile, 3 col desktop). */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
          <Stat label="Crédit disponible" value={formatCurrency(balance)} sub="appliqué auto au prochain checkout" highlight={balance > 0} />
          <Stat label="Total gagné" value={formatCurrency(totalEarned)} sub={`${rewards.filter((r) => r.status === 'CREDITED').length} parrainage${rewards.filter((r) => r.status === 'CREDITED').length > 1 ? 's' : ''}`} />
          <Stat label="En attente" value={String(rewards.filter((r) => r.status === 'PENDING').length)} sub="commande pas encore payée" />
        </section>

        {/* Ton code */}
        {code ? (
          <section
            style={{
              padding: 28,
              background: 'var(--bg-surface)',
              border: '1px solid var(--accent-primary)',
              borderRadius: 'var(--r-xl)',
              marginBottom: 28,
              display: 'grid',
              gap: 18,
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: 600, marginBottom: 6 }}>
                Ton code unique
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: 'var(--text-primary)',
                  padding: '12px 16px',
                  background: 'var(--bg-canvas)',
                  borderRadius: 'var(--r-md)',
                  display: 'inline-block',
                }}
              >
                {code}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
                Lien de partage
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--bg-canvas)',
                    color: 'var(--text-primary)',
                  }}
                />
                <CopyButton text={shareUrl} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                Partage par texto, email, WhatsApp ou réseaux sociaux. Quand ton ami passe sa
                première commande, vous recevez <strong>{rewardPerSide}</strong> chacun en crédit
                Plio (appliqué automatiquement à votre prochain checkout).
              </p>
            </div>
          </section>
        ) : (
          <section style={{ padding: 22, background: 'var(--warning-soft, #FFF6E5)', border: '1px solid var(--warning, #D97706)', borderRadius: 'var(--r-md)', marginBottom: 28 }}>
            <Icon name="alert" size={14} /> Impossible de générer ton code de parrainage. Recharge la page ou écris-nous à
            <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)', marginLeft: 4 }}>bonjour@plio.ca</a>.
          </section>
        )}

        {/* Round 19 #2 — Leaderboard top referrers */}
        {(leaderboard.top.length > 0 || leaderboard.me) && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 16px' }}>
              🏆 Top 5 parrains
            </h2>
            <div style={{
              padding: 16,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-lg)',
              display: 'grid',
              gap: 8,
            }}>
              {leaderboard.top.map((entry) => (
                <LeaderboardRow key={entry.userId} entry={entry} />
              ))}
              {leaderboard.me && (
                <>
                  <div style={{ borderTop: '1px dashed var(--border-default)', margin: '4px 0' }} />
                  <LeaderboardRow entry={leaderboard.me} />
                </>
              )}
            </div>
          </section>
        )}

        {/* Historique */}
        <section>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', margin: '0 0 16px' }}>
            Historique
          </h2>
          {rewards.length === 0 ? (
            <div
              style={{
                padding: '40px 24px',
                background: 'var(--bg-surface)',
                border: '1px dashed var(--border-default)',
                borderRadius: 'var(--r-lg)',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 14,
              }}
            >
              Pas encore de parrainage. Partage ton code pour commencer à gagner.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {rewards.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    gap: 16,
                    padding: '14px 18px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-md)',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {r.referee.firstName ?? r.referee.email.split('@')[0]}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {formatDate(r.createdAt.toISOString())}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '3px 10px',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      borderRadius: 4,
                      background: r.status === 'CREDITED' ? 'var(--success-soft, #f0fdf4)' : 'var(--bg-sunken)',
                      color: r.status === 'CREDITED' ? 'var(--success, #16a34a)' : 'var(--text-muted)',
                    }}
                  >
                    {r.status === 'CREDITED' ? <><Icon name="check" size={14} /> Crédité</> : r.status === 'PENDING' ? '… En attente' : 'Annulé'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: r.status === 'CREDITED' ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                    {formatCurrency(r.creditCents / 100)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Comment ça marche */}
        <section style={{ marginTop: 40, padding: 22, background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)' }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '0 0 12px' }}>
            Comment ça marche
          </h3>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li>Tu partages ton code (ou ton lien de partage).</li>
            <li>Ton ami clique le lien, crée son compte et passe sa première commande.</li>
            <li>Au moment où la commande est payée, vous recevez <strong>{rewardPerSide}</strong> de crédit chacun.</li>
            <li>Le crédit est appliqué automatiquement à votre prochain checkout.</li>
          </ol>
        </section>
      </main>
    </div>
  );
}

function LeaderboardRow({ entry }: { entry: { rank: number; displayName: string; totalCreditCents: number; refereeCount: number; isMe: boolean } }) {
  const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : '·';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 12,
        padding: '10px 14px',
        background: entry.isMe ? 'var(--accent-soft)' : 'transparent',
        border: entry.isMe ? '1px solid var(--accent-primary)' : '1px solid transparent',
        borderRadius: 'var(--r-md)',
        alignItems: 'center',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: entry.isMe ? 'var(--accent-primary)' : 'var(--text-muted)', minWidth: 32 }}>
        {medal} #{entry.rank}
      </span>
      <div>
        <div style={{ fontSize: 14, fontWeight: entry.isMe ? 700 : 500, color: 'var(--text-primary)', fontFamily: entry.isMe ? 'inherit' : 'var(--font-mono)' }}>
          {entry.displayName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {entry.refereeCount} parrainage{entry.refereeCount > 1 ? 's' : ''}
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: entry.isMe ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
        {formatCurrency(entry.totalCreditCents / 100)}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div
      style={{
        padding: 22,
        background: highlight ? 'var(--accent-soft)' : 'var(--bg-surface)',
        border: '1px solid',
        borderColor: highlight ? 'var(--accent-primary)' : 'var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, color: highlight ? 'var(--accent-primary)' : 'var(--text-primary)', marginTop: 6, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        {sub}
      </div>
    </div>
  );
}
