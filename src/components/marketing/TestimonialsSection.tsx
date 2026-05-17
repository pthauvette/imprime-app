/**
 * Section témoignages sur landing — affiche les reviews APPROVED+FEATURED.
 *
 * Si DB vide (no reviews yet — launch state), fallback à un message
 * concis "On vient de lancer" au lieu de placeholders fake qui briseraient
 * la confiance si le client devine.
 *
 * Cache 10 min côté Next pour pas re-query DB à chaque visit landing.
 */

import { prisma } from '@/lib/db';

export const revalidate = 600; // 10 min

// Fallback shape pour quand la DB est unreachable (build local sans DB,
// CI without DB, prod transient errors). Section sera "On vient de
// démarrer" plutôt que de crasher la page.
type ReviewLite = { id: string; displayName: string; rating: number; comment: string | null; publishedAt: Date | null };
type Stats = { _count: { _all: number }; _avg: { rating: number | null } };

async function fetchData(): Promise<{ reviews: ReviewLite[]; stats: Stats } | null> {
  try {
    const featured = await prisma.review.findMany({
      where: { status: 'APPROVED', isFeatured: true },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: { id: true, displayName: true, rating: true, comment: true, publishedAt: true },
    });
    let reviews = featured;
    if (reviews.length < 3) {
      const fill = await prisma.review.findMany({
        where: { status: 'APPROVED', isFeatured: false, comment: { not: null } },
        orderBy: { publishedAt: 'desc' },
        take: 3 - reviews.length,
        select: { id: true, displayName: true, rating: true, comment: true, publishedAt: true },
      });
      reviews = [...reviews, ...fill];
    }
    const stats = await prisma.review.aggregate({
      where: { status: 'APPROVED' },
      _count: { _all: true },
      _avg: { rating: true },
    });
    return { reviews, stats };
  } catch {
    return null; // DB unreachable → fallback "on vient de démarrer"
  }
}

export default async function TestimonialsSection() {
  const data = await fetchData();
  const reviews = data?.reviews ?? [];
  const stats = data?.stats ?? { _count: { _all: 0 }, _avg: { rating: null } };

  // Si vraiment 0 avis : section "On vient de lancer" honnête au lieu de fake
  if (reviews.length === 0) {
    return (
      <section className="testimonials-section" style={{ maxWidth: 'none', padding: 0, margin: 0 }}>
        <div className="testimonials-section-inner">
          <div className="section-eyebrow">Témoignages</div>
          <h2 className="section-title">On vient de <em>démarrer.</em></h2>
          <p className="section-lede">
            Plio est tout récent — pas encore d&apos;avis client publiés. Sois parmi les premiers à essayer, on traitera ta commande avec un soin maniaque.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="testimonials-section" style={{ maxWidth: 'none', padding: 0, margin: 0 }}>
      <div className="testimonials-section-inner">
        <div className="section-eyebrow">Témoignages</div>
        <h2 className="section-title">
          {stats._count._all > 5
            ? <>Ils nous ont fait <em>confiance.</em></>
            : <>Premiers retours <em>clients.</em></>}
        </h2>
        <p className="section-lede">
          {stats._count._all} avis publiés · note moyenne {stats._avg.rating?.toFixed(1) ?? '5,0'} / 5
        </p>
        <div className="testimonials-grid">
          {reviews.map((r) => (
            <div key={r.id} className="testimonial-card">
              <div className="testimonial-stars">
                {'★'.repeat(r.rating)}
              </div>
              {r.comment && (
                <p className="testimonial-quote">« {r.comment} »</p>
              )}
              <div className="testimonial-author">
                <div className="testimonial-avatar"></div>
                <div className="testimonial-meta">
                  <strong>{r.displayName}</strong>
                  <span>Plio · client {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' }) : ''}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
