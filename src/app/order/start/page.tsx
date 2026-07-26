/**
 * /order/start — Step 1 wizard : category picker.
 *
 * Server Component qui fetch le catalogue Sinalite et groupe en 8 familles
 * éditoriales (voir lib/catalogue.ts). Chaque carte linke vers
 * /order/product?category=<slug>.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { sinalite, SinaliteError } from '@/lib/sinalite/client';
import { Icon } from '@/components/ui/Icon';
import { applyProductOverrides } from '@/lib/products/overrides';
import { groupProductsByFamily } from '@/lib/catalogue';
import CategoryIcon from '@/components/wizard/CategoryIcon';
import { formatNumber } from '@/lib/format';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { buildReorderDeepLink } from '@/lib/orders/reorder';
import { logSinalite } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import HeaderUserSlot from '@/components/account/HeaderUserSlot';
import { getReviewStats } from '@/lib/reviews/stats';
import * as Sentry from '@sentry/nextjs';

export const metadata = { title: "Quoi imprimer ?" };
export const dynamic = 'force-dynamic';

export default async function OrderStartPage({
  searchParams,
}: {
  searchParams: Promise<{ reorder?: string }>;
}) {
  // ─── Reorder flow (lien depuis email delivered ou bouton /orders/[id]) ──
  // Si ?reorder=ORDER_ID : on requiert auth, on vérifie ownership, on extrait
  // productId + options de la commande originale, et on redirect direct vers
  // /order/configure pour skipper la category picker. L'user repasse par
  // upload + shipping + paiement — c'est intentionnel : files peuvent avoir
  // expiré côté S3, et c'est une bonne pratique qualité de revérifier.
  const { reorder } = await searchParams;
  if (reorder) {
    const session = await auth();
    if (!session?.user?.id) {
      redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/order/start?reorder=${reorder}`)}` as Route);
    }
    const order = await prisma.order.findUnique({
      where: { id: reorder },
      select: { userId: true, sinalitePayload: true, createdAt: true },
    });
    // Si pas trouvé OU pas owner OU pas admin → fall through au flow normal
    // (silencieusement — on ne leak pas l'existence de l'id).
    const isOwner = order?.userId === session.user.id;
    const isAdmin = session.user.role === 'ADMIN';
    if (order && (isOwner || isAdmin)) {
      const link = buildReorderDeepLink(order.sinalitePayload, order.createdAt);
      if (link.ok) redirect(link.url as Route);
      // Si payload corrompu : on continue sur la page normale, l'user
      // verra son catalog et choisira manuellement.
    }
  }

  // Graceful degradation : si Sinalite répond mal (schema mismatch, 5xx,
  // timeout), on ne crash pas la page entière — on log + alerte Slack +
  // affiche un message utilisateur clair avec lien de contact.
  let products: Awaited<ReturnType<typeof sinalite.listProducts>> = [];
  let fetchError: { message: string; details?: unknown } | null = null;
  try {
    products = await sinalite.listProducts();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'unknown';
    const errDetails = err instanceof SinaliteError
      ? { status: err.status, endpoint: err.endpoint, body: typeof err.body === 'string' ? err.body.slice(0, 500) : err.body }
      : undefined;
    logSinalite.error({ err, errDetails }, 'listProducts failed on /order/start');
    // Capture Sentry explicite avec le contexte enrichi — sans ça l'erreur
    // est swallowed par notre catch et ne remonte jamais à Sentry.
    Sentry.withScope((scope) => {
      scope.setTag('component', 'order-start');
      scope.setTag('integration', 'sinalite');
      scope.setLevel('error');
      if (errDetails) {
        scope.setContext('sinalite_error_details', errDetails as Record<string, unknown>);
      }
      Sentry.captureException(err);
    });
    await sendCriticalAlert({
      severity: 'critical',
      title: 'Catalogue Sinalite indisponible — /order/start cassé',
      body: 'L\'API Sinalite ne répond pas correctement à listProducts. Les nouveaux clients ne peuvent pas démarrer une commande.',
      context: { error: errMsg, details: errDetails },
    });
    fetchError = { message: errMsg, details: errDetails };
  }

  // Applique les overrides admin (hide les produits désactivés) avant de
  // grouper par famille. Aussi évite que la catégorie apparaisse vide à
  // tort si tous ses produits sont disabled par l'admin.
  const visibleProducts = await applyProductOverrides(
    products.filter((p) => p.enabled === 1),
  );

  const families = groupProductsByFamily(visibleProducts)
    .filter((f) => f.productCount > 0)
    // Round 45 #3 — cap défensif au-dessus du nombre de familles (8) pour ne
    // jamais tronquer silencieusement si une 9e famille est ajoutée plus tard.
    .slice(0, 9);

  const totalProducts = visibleProducts.length;

  // Round 45 #1 — stats avis réelles (APPROVED) pour le social proof vérifiable.
  const reviewStats = await getReviewStats();

  // Fetch top-3 saved configs pour l'user connecté → widget "Reprendre"
  // au-dessus de la category grid. Pas d'auth = pas de widget (silencieux).
  const session = await auth();
  let recentConfigs: Array<{ id: string; name: string; productName: string; summary: string }> = [];
  if (session?.user?.id) {
    try {
      const rows = await prisma.savedConfig.findMany({
        where: { userId: session.user.id },
        orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 3,
        select: { id: true, name: true, productName: true, summary: true },
      });
      recentConfigs = rows;
    } catch {
      // DB ou table SavedConfig pas migrée : on cache silencieusement le widget.
    }
  }

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>
            Plio.
          </Link>
        </div>
        <div className="progress-block">
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={1}
            aria-valuemin={1}
            aria-valuemax={6}
            aria-label="Étape 1 sur 6"
          >
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 01 sur 06 — Catégorie</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <HeaderUserSlot hideWhenAnonymous />
        </div>
      </header>

      <main className="step-layout">
        <div className="step-content">
          <div className="step-eyebrow">Étape 01</div>
          <h1 className="step-question">
            Quoi imprimer
            <br />
            <em>aujourd'hui ?</em>
          </h1>
          <p className="step-lede">
            Plus de {formatNumber(totalProducts)} produits actifs, devis instantané, livraison partout au Canada en 1 à 7 jours.
          </p>

          {/* Round 45 #1 — social proof VÉRIFIABLE : faits permanents +
              note réelle (avis APPROVED) seulement si seuil atteint. Avant :
              « 47 commandes/h » et « 12k+ avis Trustpilot » étaient inventés. */}
          <div className="social-proof-row">
            <span className="social-proof">Livraison partout au Canada · 1 à 7 jours</span>
            {reviewStats.display ? (
              <span className="social-proof">
                {reviewStats.avgRating!.toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sur 5 — {reviewStats.count} avis clients
              </span>
            ) : (
              <span className="social-proof">Devis instantané, sans surprise</span>
            )}
            <span className="social-proof">Prix wholesale, sans abonnement</span>
          </div>

          {recentConfigs.length > 0 && (
            <section
              aria-label="Configurations sauvegardées"
              style={{
                marginBottom: 24,
                padding: 20,
                background: 'var(--bg-surface)',
                border: '1px solid var(--accent-primary)',
                borderRadius: 'var(--r-lg)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: 600 }}>
                  Reprends une configuration sauvée
                </div>
                <Link href={'/account/favorites' as Route} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Tout voir →
                </Link>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {recentConfigs.map((c) => (
                  <a
                    key={c.id}
                    href={`/api/saved-configs/${c.id}/redirect`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 12,
                      padding: '12px 16px',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--r-md)',
                      textDecoration: 'none',
                      color: 'inherit',
                      alignItems: 'center',
                      transition: 'border-color var(--dur-fast)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                        {c.productName} · {c.summary}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--accent-primary)', fontWeight: 600 }}>Continuer →</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {fetchError && (
            <div
              role="alert"
              style={{
                padding: '20px 24px',
                background: 'var(--warning-soft, #FFF6E5)',
                border: '1px solid var(--warning, #D97706)',
                borderRadius: 'var(--r-md)',
                marginBottom: 24,
                fontSize: 14,
                color: 'var(--text-primary)',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--warning, #D97706)' }}>
                <Icon name="alert" size={13} /> Catalogue temporairement indisponible
              </div>
              <div>
                Notre API de catalogue ne répond pas. On a été notifiés et on
                regarde ça. En attendant, contacte-nous à{' '}
                <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>bonjour@plio.ca</a>{' '}
                ou via le <a href="/contact" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>formulaire</a>{' '}
                — on peut préparer ta commande manuellement.
              </div>
              {process.env.NODE_ENV !== 'production' && (
                <details style={{ marginTop: 4, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  <summary style={{ cursor: 'pointer' }}>Debug (dev only)</summary>
                  <pre style={{ marginTop: 4, padding: 8, background: 'var(--bg-canvas)', overflow: 'auto' }}>
{JSON.stringify(fetchError, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          <div className="category-grid">
            {families.map((family, i) => (
              <Link
                key={family.slug}
                // Toujours /order/product : cette page fait déjà le collapse
                // virtuel+brut (tuile Papier × Finition pour les productId
                // couverts par un produit virtuel + liste normale pour le
                // reste). Court-circuiter directement vers /order/v/<slug>
                // ici sautait les productId NON couverts par le produit
                // virtuel (ex. Foil métallique/Die Cut/pliées pour les cartes
                // de visite — vendus sur la landing, injoignables depuis ce
                // picker). Cf. docs/experience-client-2026-07.md Foyer 4.1.
                href={`/order/product?category=${family.slug}` as Route}
                className="cat-card"
                style={{ '--i': String(i) } as React.CSSProperties}
              >
                <div className="cat-card-top">
                  <CategoryIcon icon={family.icon} />
                  <span className="cat-num">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="cat-body">
                  <div className="cat-name">{family.name}</div>
                  <div className="cat-desc">{family.description}</div>
                </div>
                <div className="cat-price-row">
                  <span className="cat-price-label">{family.productCount} produit{family.productCount > 1 ? 's' : ''}</span>
                  <span className="cat-price">Explorer →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="recap">
          <div>
            <div className="recap-section-label">Comment ça marche</div>
            <ol className="how-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li className="how-item active">
                <span className="how-item-num">1</span>
                <span className="how-item-text">Choisis une catégorie</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">2</span>
                <span className="how-item-text">Pick le produit exact</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">3</span>
                <span className="how-item-text">Format, papier, finition</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">4</span>
                <span className="how-item-text">Quantité &amp; prix live</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">5</span>
                <span className="how-item-text">Téléverse ton design</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">6</span>
                <span className="how-item-text">Adresse &amp; livraison</span>
              </li>
              <li className="how-item">
                <span className="how-item-num">7</span>
                <span className="how-item-text">Paiement &amp; production</span>
              </li>
            </ol>
          </div>
        </aside>
      </main>
    </div>
  );
}
