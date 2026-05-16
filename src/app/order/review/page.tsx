/**
 * /order/review?productId=N&options=...&files=...&ship=... — Step 7 wizard.
 *
 * 1. POST /api/orders/create avec tout le state → reçoit clientSecret + breakdown
 * 2. Render Stripe Elements PaymentElement
 * 3. À la confirmation → stripe.confirmPayment() redirige vers /order/confirmation
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY manquante');
    return null;
  }
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

interface ShipState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  method: string;
  price: number;
}

interface Breakdown {
  subtotal: number;
  shipping: number;
  tax: number;
  taxLines: { code: string; label: string; rate: number; amount: number }[];
  total: number;
  currency: string;
}

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewPageInner />
    </Suspense>
  );
}

function ReviewPageInner() {
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId');
  const optionsParam = searchParams.get('options') ?? '';
  const filesParam = searchParams.get('files') ?? '';
  const shipParam = searchParams.get('ship');

  const ship: ShipState | null = useMemo(() => {
    if (!shipParam) return null;
    try { return JSON.parse(shipParam); } catch { return null; }
  }, [shipParam]);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create PaymentIntent on mount
  useEffect(() => {
    if (!productId || !ship) {
      setError('Données manquantes — recommence le wizard.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const optionIds = optionsParam.split(',').filter(Boolean).map(Number);

        const files = filesParam
          .split('|')
          .filter(Boolean)
          .map((f) => {
            const idx = f.indexOf(':');
            const type = f.slice(0, idx);
            const url = f.slice(idx + 1);
            return { type: type as 'front' | 'back', url: decodeURIComponent(url) };
          });

        // Fetch the live price first (server-side variant index lookup) to set expectedSubtotal
        const lookupRes = await fetch(`/api/products/${productId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionIds }),
        });
        const lookupData = await lookupRes.json();
        const expectedSubtotal = lookupData.price ?? 1;

        const createRes = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ productId: Number(productId), optionIds, files, internalRef: `IMPRIME-${Date.now()}` }],
            contact: { firstName: ship.firstName, lastName: ship.lastName, email: ship.email, phone: ship.phone },
            shippingAddress: { line1: ship.line1, line2: ship.line2, city: ship.city, province: ship.province, postalCode: ship.postalCode },
            shippingMethod: ship.method,
            shippingPrice: ship.price,
            expectedSubtotal,
            notes: `Test commande Imprime ${new Date().toISOString()}`,
          }),
        });

        if (!createRes.ok) {
          const data = await createRes.json();
          console.error('[orders/create] failed:', data);
          throw new Error((data.error || `HTTP ${createRes.status}`) + (data.details ? ` — ${JSON.stringify(data.details)}` : ''));
        }

        const data = await createRes.json();
        if (!cancelled) {
          setClientSecret(data.clientSecret);
          setBreakdown(data.breakdown);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId, optionsParam, filesParam, ship]);

  const stripe = getStripe();
  const prevHref = `/order/shipping?productId=${productId}&options=${optionsParam}&files=${filesParam}` as Route;

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>Imprime.</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb">Récapitulatif & paiement</span>
        </div>
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuenow={7} aria-valuemin={1} aria-valuemax={7}>
            <div className="progress-segment done"></div><div className="progress-segment done"></div>
            <div className="progress-segment done"></div><div className="progress-segment done"></div>
            <div className="progress-segment done"></div><div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
          </div>
          <div className="progress-label">Étape 07 sur 07 — Récapitulatif & paiement</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <button className="btn btn-ghost btn-sm">⌘ K</button>
        </div>
      </header>

      <main className="step-layout">
        <div className="step-content" style={{ padding: '56px 64px', maxWidth: 800 }}>
          <div className="step-eyebrow">Étape 07</div>
          <h1 className="step-question">Dernière <em>vérification.</em></h1>
          <p className="step-lede">
            On démarre la production dès que ton paiement est confirmé. Tracking par courriel sous 24h.
          </p>

          {ship && (
            <div className="panel" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: 28, marginBottom: 16, boxShadow: 'var(--shadow-xs)' }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Récap commande</div>
              <Row label="Produit" value={`#${productId}`} />
              <Row label="Options" value={`${optionsParam.split(',').filter(Boolean).length} sélections`} />
              <Row label="Fichiers" value={`${filesParam.split('|').filter(Boolean).length} fichier(s)`} />
              <Row label="Destinataire" value={`${ship.firstName} ${ship.lastName}`} />
              <Row label="Adresse" value={`${ship.line1}, ${ship.city} ${ship.province} ${ship.postalCode}`} />
              <Row label="Livraison" value={`${ship.method} · ${ship.price.toFixed(2)} $`} />
            </div>
          )}

          {breakdown && (
            <div style={{ background: 'linear-gradient(180deg, var(--bg-sunken) 0%, var(--accent-soft) 100%)', border: '1px solid var(--accent-soft)', borderRadius: 'var(--r-lg)', padding: 32, marginBottom: 24 }}>
              <Total label="Sous-total impression" value={breakdown.subtotal} />
              <Total label={`Livraison${ship ? ' (' + ship.method + ')' : ''}`} value={breakdown.shipping} />
              {breakdown.taxLines.map((t) => (
                <Total key={t.code} label={t.label} value={t.amount} />
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 16, marginTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Total à payer</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 400, color: 'var(--accent-primary)', letterSpacing: '-0.03em' }}>
                  {breakdown.total.toFixed(2)} $
                </span>
              </div>
            </div>
          )}
        </div>

        <aside className="recap" style={{ padding: 0 }}>
          <div style={{ padding: 32, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)', margin: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.02em', fontWeight: 400, margin: 0 }}>Paiement</h2>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', color: 'var(--success)', fontWeight: 600 }}>
                🔒 Stripe
              </span>
            </div>

            {loading && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>⏳ Initialisation du paiement…</div>}
            {error && (
              <div style={{ padding: 16, background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', color: 'var(--danger)', fontSize: 13 }}>
                <strong>Erreur :</strong> {error}
              </div>
            )}
            {clientSecret && breakdown && stripe && (
              <Elements
                stripe={stripe}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#1F3D2B',
                      colorBackground: '#FAFAF7',
                      colorText: '#141C16',
                      borderRadius: '12px',
                      fontFamily: 'Inter, system-ui, sans-serif',
                    },
                  },
                }}
              >
                <PaymentForm total={breakdown.total} />
              </Elements>
            )}
          </div>
          <div style={{ padding: '0 32px 32px', display: 'grid', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
            <div>★ Production démarre sous 2h</div>
            <div>★ Annulation possible avant production</div>
            <div>★ Tracking par courriel sous 24h</div>
          </div>
        </aside>
      </main>

      <footer className="shell-footer">
        <div>
          <Link href={prevHref} className="btn btn-ghost">
            <span style={{ fontFamily: 'var(--font-mono)' }}>←</span> Précédent
          </Link>
        </div>
        <div className="shell-footer-center">↵ Entrée pour confirmer</div>
        <div className="shell-footer-right">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            PAIEMENT VIA STRIPE
          </span>
        </div>
      </footer>
    </div>
  );
}

function PaymentForm({ total }: { total: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(true);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setStripeError(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/order/confirmation`,
      },
    });
    if (error) {
      setStripeError(error.message ?? 'Erreur de paiement');
      setSubmitting(false);
    }
    // Sur succès, Stripe redirige vers return_url avec ?payment_intent=… &payment_intent_client_secret=…
  };

  return (
    <div>
      <PaymentElement />
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--accent-primary)' }}
        />
        <span>
          J'accepte les <a href="#" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>conditions générales</a> et la <a href="#" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>politique de remboursement</a>.
        </span>
      </label>
      {stripeError && (
        <div style={{ padding: 12, background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 'var(--r-md)', fontSize: 13, marginBottom: 12 }}>
          {stripeError}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={!stripe || !accepted || submitting}
        style={{
          width: '100%',
          height: 64,
          background: 'var(--accent-primary)',
          color: 'var(--text-on-accent)',
          borderRadius: 'var(--r-pill)',
          fontSize: 17,
          fontWeight: 600,
          boxShadow: 'var(--shadow-accent)',
          cursor: submitting ? 'wait' : !accepted ? 'not-allowed' : 'pointer',
          opacity: submitting || !accepted ? 0.6 : 1,
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        {submitting ? '⏳ Traitement…' : (
          <>
            Confirmer la commande
            <span style={{ fontFamily: 'var(--font-mono)' }}>{total.toFixed(2)} $</span>
          </>
        )}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 500 }}>
        {value.toFixed(2)} $
      </span>
    </div>
  );
}
