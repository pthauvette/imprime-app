/**
 * /order/confirmation?payment_intent=pi_...&payment_intent_client_secret=...
 *
 * Stripe redirige ici après confirmPayment(). On lit le payment_intent depuis
 * l'URL, on récupère son statut côté serveur (via Stripe SDK) et on affiche
 * la confirmation.
 *
 * Note: le vrai order Sinalite est créé async par webhooks/stripe/route.ts.
 * Cette page n'affiche que la confirmation Stripe — l'orderId Sinalite arrive
 * par email dès que le webhook l'a créé (généralement < 5s).
 */

import Link from 'next/link';
import type { Route } from 'next';
import Stripe from 'stripe';
import CartClearOnMount from '@/components/cart/CartClearOnMount';

export const metadata = { title: "C'est imprimé — Plio" };
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; payment_intent_client_secret?: string }>;
}) {
  const params = await searchParams;
  const paymentIntentId = params.payment_intent;

  if (!paymentIntentId) {
    return <ManualConfirmation />;
  }

  let intent: Stripe.PaymentIntent | null = null;
  let fetchError: string | null = null;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (e) {
    fetchError = e instanceof Error ? e.message : 'Erreur Stripe';
  }

  if (fetchError || !intent) {
    return <ErrorState message={fetchError ?? 'PaymentIntent introuvable.'} />;
  }

  const isSuccess = intent.status === 'succeeded' || intent.status === 'processing';
  if (!isSuccess) {
    return <PendingState status={intent.status} intentId={intent.id} />;
  }

  const amountCAD = (intent.amount / 100).toFixed(2);
  const receiptEmail = intent.receipt_email ?? intent.metadata.contactEmail ?? '(email inconnu)';
  const province = intent.metadata.province ?? 'CA';
  const shippingMethod = intent.metadata.shippingMethod ?? 'UPS Standard';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, var(--bg-canvas) 0%, var(--accent-soft) 50%, var(--bg-canvas) 100%)' }}>
      {/* Vide le cart localStorage maintenant que le payment est confirmé */}
      <CartClearOnMount />
      <header style={{ display: 'flex', alignItems: 'center', padding: '24px 48px' }}>
        <Link href={'/' as Route} style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--accent-primary)', letterSpacing: '-0.02em' }}>
          Plio.
        </Link>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 32px 96px', display: 'grid', gap: 40 }}>
        <div style={{ display: 'grid', placeItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              background: 'var(--accent-primary)',
              display: 'grid',
              placeItems: 'center',
              boxShadow: 'var(--shadow-accent)',
            }}
          >
            <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="var(--text-on-accent)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="5 12 10 17 19 8" />
            </svg>
          </div>
          <div style={{ textAlign: 'center', display: 'grid', gap: 12 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(56px, 8vw, 96px)', lineHeight: 1, letterSpacing: '-0.04em', margin: 0, fontWeight: 400 }}>
              C'est <em style={{ color: 'var(--accent-primary)' }}>imprimé.</em>
            </h1>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
              PaymentIntent <strong style={{ color: 'var(--text-primary)' }}>{intent.id.slice(0, 20)}…</strong> · {intent.status.toUpperCase()}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-xl)', padding: 32, boxShadow: 'var(--shadow-md)', display: 'grid', gap: 20 }}>
          <Row label="Total payé" value={`${amountCAD} $ CAD`} />
          <Row label="Email de confirmation" value={receiptEmail} />
          <Row label="Méthode de livraison" value={shippingMethod} />
          <Row label="Province (taxes)" value={province} />
          <div style={{ padding: '16px 20px', background: 'var(--accent-soft)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            ★ <strong>Production démarre sous 2h.</strong> Tu vas recevoir un email avec ton numéro de commande dès que notre prépresse a validé tes fichiers.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href={'/orders' as Route} className="btn btn-primary">Voir mes commandes →</Link>
          <Link href={'/order/start' as Route} className="btn btn-secondary">Commander à nouveau</Link>
        </div>

        <footer style={{ paddingTop: 24, borderTop: '1px solid var(--border-subtle)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          ★ HELLO@IMPRIME.CO · © IMPRIME 2026 🇨🇦
        </footer>
      </main>
    </div>
  );
}

function ManualConfirmation() {
  return (
    <ErrorState
      message="Aucun PaymentIntent dans l'URL. Reviens à l'accueil pour démarrer une commande."
      isInfo
    />
  );
}

function PendingState({ status, intentId }: { status: string; intentId: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 48, textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 48, letterSpacing: '-0.025em', fontWeight: 400, margin: '0 0 16px' }}>
          Paiement en cours…
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
          Statut Stripe : <strong>{status}</strong>
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{intentId}</p>
        <Link href={'/orders' as Route} className="btn btn-primary" style={{ marginTop: 32 }}>Voir mes commandes</Link>
      </div>
    </div>
  );
}

function ErrorState({ message, isInfo = false }: { message: string; isInfo?: boolean }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 48, textAlign: 'center' }}>
      <div style={{ maxWidth: 480 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{isInfo ? 'ℹ️' : '⚠️'}</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, letterSpacing: '-0.025em', fontWeight: 400, margin: '0 0 16px' }}>
          {isInfo ? 'Confirmation' : 'Erreur'}
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '0 0 32px' }}>{message}</p>
        <Link href={'/' as Route} className="btn btn-primary">Retour à l'accueil</Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
