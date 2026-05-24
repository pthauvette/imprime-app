/**
 * LoyaltyTierProgress — Server Component widget pour /account.
 *
 * Round 27 #5. Affiche le tier courant, la progress vers le tier supérieur,
 * et le montant restant à dépenser. GOLD users voient un état "max" sans
 * progress bar mais avec leurs perks.
 *
 * Computed côté caller via lib/customers/loyalty.ts (pure function),
 * passé en prop ici — le widget est dumb / render-only.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { TIER_LABELS, TIER_PERKS, type LoyaltyTier } from '@/lib/customers/loyalty';
import { formatCurrency } from '@/lib/format';

interface Props {
  current: LoyaltyTier;
  next: LoyaltyTier | null;
  needsCents: number | null;
  progressPct: number;
  /** Revenu 365j en cents (pour afficher le "X $ dépensés"). */
  revenueLast365dCents: number;
}

const TIER_COLOR: Record<LoyaltyTier, string> = {
  BRONZE: '#A97142',
  SILVER: '#9BA5B0',
  GOLD: '#D4AF37',
};

const TIER_EMOJI: Record<LoyaltyTier, string> = {
  BRONZE: '🥉',
  SILVER: '🥈',
  GOLD: '🥇',
};

export default function LoyaltyTierProgress(props: Props) {
  const { current, next, needsCents, progressPct, revenueLast365dCents } = props;
  const color = TIER_COLOR[current];
  const isMax = current === 'GOLD';

  return (
    <section
      style={{
        padding: 20,
        background: 'var(--bg-surface)',
        border: `1px solid var(--border-subtle)`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 'var(--r-xl)',
        marginBottom: 16,
      }}
      aria-label="Programme de fidélité"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600,
          }}>
            Statut fidélité
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, letterSpacing: '-0.02em',
            color, marginTop: 4,
          }}>
            {TIER_EMOJI[current]} {TIER_LABELS[current]}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600,
          }}>
            365 derniers jours
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, marginTop: 4 }}>
            {formatCurrency(revenueLast365dCents / 100)}
          </div>
        </div>
      </div>

      {isMax ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          ⭐ Tu profites de tous nos avantages premium. Merci d&apos;être un client GOLD !
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{
              fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.4,
            }}>
              Encore <strong style={{ color: 'var(--text-primary)' }}>
                {needsCents ? formatCurrency(needsCents / 100) : '—'}
              </strong> en commandes pour atteindre{' '}
              <strong style={{ color: TIER_COLOR[next!] }}>
                {TIER_EMOJI[next!]} {TIER_LABELS[next!]}
              </strong>.
            </div>
            <div
              style={{
                position: 'relative',
                height: 8,
                background: 'var(--bg-sunken)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progression vers ${TIER_LABELS[next!]}`}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  background: TIER_COLOR[next!],
                  borderRadius: 4,
                  transition: 'width 400ms ease-out',
                }}
              />
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
              marginTop: 4, textAlign: 'right',
            }}>
              {progressPct}%
            </div>
          </div>
        </>
      )}

      <details style={{ marginTop: 12 }}>
        <summary style={{
          fontSize: 12, color: 'var(--accent-primary)', cursor: 'pointer', userSelect: 'none',
        }}>
          Voir mes avantages {TIER_LABELS[current]}
        </summary>
        <ul style={{
          marginTop: 8, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          {TIER_PERKS[current].map((perk) => (
            <li key={perk}>{perk}</li>
          ))}
        </ul>
        {!isMax && (
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            <Link href={'/about' as Route} style={{ color: 'var(--accent-primary)' }}>
              En savoir plus sur le programme →
            </Link>
          </p>
        )}
      </details>
    </section>
  );
}
