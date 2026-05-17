/**
 * /reviews/submit?orderId=X&token=Y
 *
 * Page publique pour laisser un avis sur une commande livrée. Pas de
 * login required — le token HMAC dans l'URL prouve que l'user est
 * légit (a accès à l'email original du customer).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { prisma } from '@/lib/db';
import { reviewSubmitToken } from '@/lib/reviews/token';
import ReviewSubmitForm from './ReviewSubmitForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laisser un avis · Plio' };

export default async function ReviewSubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; token?: string }>;
}) {
  const { orderId, token } = await searchParams;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-subtle)' }}>
        <Link href={'/' as Route} style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent-primary)', textDecoration: 'none' }}>
          Plio.
        </Link>
      </header>

      <main style={{ flex: 1, padding: '48px 24px', display: 'grid', placeItems: 'start center' }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <Suspense fallback={<div>Vérification…</div>}>
            <ReviewContext orderId={orderId} token={token} />
          </Suspense>
        </div>
      </main>

      <footer style={{ padding: '24px 32px', borderTop: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        Une question ? <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a>
      </footer>
    </div>
  );
}

async function ReviewContext({ orderId, token }: { orderId?: string; token?: string }) {
  if (!orderId || !token) {
    return (
      <ErrorBlock>
        Lien incomplet. Utilise le lien exact reçu par email après la livraison.
      </ErrorBlock>
    );
  }

  if (token !== reviewSubmitToken(orderId)) {
    return (
      <ErrorBlock>
        Lien invalide ou expiré. Si tu penses qu&apos;il y a une erreur, contacte-nous
        à <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a>.
      </ErrorBlock>
    );
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { firstName: true, name: true } },
      review: true,
    },
  });

  if (!order) {
    return <ErrorBlock>Commande introuvable.</ErrorBlock>;
  }

  if (order.status !== 'DELIVERED') {
    return (
      <ErrorBlock>
        Cette commande n&apos;est pas encore livrée. Tu pourras laisser un avis dès
        qu&apos;elle arrive.
      </ErrorBlock>
    );
  }

  if (order.review) {
    return (
      <div style={{ padding: '24px', background: 'var(--success-soft, #f0fdf4)', border: '1px solid var(--success, #16a34a)', borderRadius: 'var(--r-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: 32 }}>✓</div>
        <h2 style={{ margin: '8px 0', fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400 }}>Merci !</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Tu nous as déjà laissé un avis pour cette commande. On l&apos;apprécie vraiment.
        </p>
      </div>
    );
  }

  const fallbackName = order.user.firstName ?? order.user.name?.split(' ')[0] ?? order.shipName.split(' ')[0];

  return (
    <ReviewSubmitForm
      orderId={orderId}
      token={token}
      defaultName={fallbackName ?? 'Client Plio'}
      productSummary={order.productSummary ?? 'ta commande'}
    />
  );
}

function ErrorBlock({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '20px 24px', background: 'var(--warning-soft, #FFF6E5)', border: '1px solid var(--warning, #D97706)', borderRadius: 'var(--r-md)', fontSize: 14, color: 'var(--text-primary)' }}>
      ⚠ {children}
    </div>
  );
}
