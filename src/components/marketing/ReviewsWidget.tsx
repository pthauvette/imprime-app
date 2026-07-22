/**
 * ReviewsWidget — section "Ce qu'on dit de nous" sur landing.
 *
 * Round 22 #4. Server Component. Pull les 5 reviews APPROVED les plus
 * récentes avec un comment (>= 30 chars pour éviter "ok" comme review).
 *
 * isFeatured priorisé en premier (admin choice), puis sort par publishedAt
 * desc. Hide gracefully si zéro review qualifiable.
 */

import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { Icon } from '@/components/ui/Icon';

interface ReviewForDisplay {
  rating: number;
  comment: string;
  displayName: string;
  publishedAt: Date | null;
  // Round 25 #4 — réponse publique admin (Trustpilot-style)
  adminReply: string | null;
  adminReplyAt: Date | null;
}

const MIN_COMMENT_LEN = 30;
const MAX_DISPLAY = 5;

/**
 * Fetch les reviews approuvées. Catch tout pour rendre une landing
 * robuste si Review table absente (Cas migration locale).
 */
async function fetchApprovedReviews(): Promise<ReviewForDisplay[]> {
  try {
    return await prisma.review.findMany({
      where: {
        status: 'APPROVED',
        comment: { not: null },
      },
      orderBy: [
        { isFeatured: 'desc' },
        { publishedAt: 'desc' },
      ],
      take: 20, // pull plus, filter en JS
      select: {
        rating: true,
        comment: true,
        displayName: true,
        publishedAt: true,
        adminReply: true,
        adminReplyAt: true,
      },
    }).then((rows) =>
      rows
        .filter((r): r is ReviewForDisplay =>
          r.comment !== null && r.comment.length >= MIN_COMMENT_LEN,
        )
        .slice(0, MAX_DISPLAY),
    );
  } catch {
    return [];
  }
}

// Audit v2 #10.1 — cache le résultat 10 min (tag `reviews`) : la landing est
// dynamique (cookies i18n), donc sans ce cache cette requête tournait à CHAQUE
// visite. revalidateTag('reviews') côté admin invalide immédiatement.
const getApprovedReviewsCached = unstable_cache(fetchApprovedReviews, ['landing-reviews-widget-v1'], {
  revalidate: 600,
  tags: ['reviews'],
});

export default async function ReviewsWidget() {
  const reviews = await getApprovedReviewsCached();

  if (reviews.length === 0) return null;

  // Aggregate stats : moyenne rating + count total (incl. ceux pas affichés)
  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  return (
    <section style={{
      padding: '80px 24px',
      background: 'var(--bg-sunken)',
      borderTop: '1px solid var(--border-subtle)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--accent-primary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 12,
          }}>
            Ce qu&apos;on dit de nous
          </div>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(32px, 4vw, 44px)',
            margin: '0 0 12px',
            letterSpacing: '-0.02em',
            fontWeight: 400,
            lineHeight: 1.1,
          }}>
            {avgRating.toFixed(1)} / 5 <Icon name="star" size={14} /> par nos clients
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            Reviews vérifiées après livraison.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
        }}>
          {reviews.map((r, idx) => (
            <ReviewCard key={idx} review={r} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: ReviewForDisplay }) {
  // Initiales pour avatar visuel sans photo (anonymized-friendly)
  const initials = review.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <article style={{
      padding: 24,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--r-xl)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Star rating — Unicode ★ vs ☆ pour filled vs empty */}
      <div style={{ display: 'flex', gap: 2, color: 'var(--accent-primary)', fontSize: 18 }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <span key={s} style={{ opacity: s <= review.rating ? 1 : 0.25 }}><Icon name="star" size={18} /></span>
        ))}
      </div>

      <blockquote style={{
        margin: 0,
        fontSize: 14,
        lineHeight: 1.5,
        color: 'var(--text-secondary)',
        fontStyle: 'italic',
      }}>
        « {review.comment} »
      </blockquote>

      {/* Round 25 #4 — réponse publique admin (Trustpilot-style) */}
      {review.adminReply && (
        <div
          style={{
            marginTop: 4,
            padding: '10px 12px',
            background: 'var(--bg-sunken)',
            borderLeft: '3px solid var(--accent-primary)',
            borderRadius: '4px 8px 8px 4px',
            fontSize: 12.5,
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--accent-primary)',
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Réponse de Plio
            {review.adminReplyAt && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 6 }}>
                · {new Date(review.adminReplyAt).toLocaleDateString('fr-CA', { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
          {review.adminReply}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 8, borderTop: '1px dashed var(--border-subtle)' }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'var(--accent-primary)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
        }}>
          {initials || '?'}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {review.displayName}
          </div>
          {review.publishedAt && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {new Date(review.publishedAt).toLocaleDateString('fr-CA', { month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
