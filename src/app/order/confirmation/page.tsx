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
import { Icon, type IconName } from '@/components/ui/Icon';
import { getStripe } from '@/lib/stripe/client';

export const metadata = { title: "C'est imprimé — Plio" };
export const dynamic = 'force-dynamic';

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
    intent = await getStripe().paymentIntents.retrieve(paymentIntentId);
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
            <Icon name="info" size={14} /> <strong>Production démarre sous 2h.</strong> Tu vas recevoir un email avec ton numéro de commande dès que notre prépresse a validé tes fichiers.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href={'/orders' as Route} className="btn btn-primary">Voir mes commandes →</Link>
          <Link href={'/order/start' as Route} className="btn btn-secondary">Commander à nouveau</Link>
        </div>

        <footer style={{ paddingTop: 24, borderTop: '1px solid var(--border-subtle)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
          bonjour@plio.ca · © Plio 2026
        </footer>
      </main>
    </div>
  );
}

function ManualConfirmation() {
  // Pas de payment_intent dans l'URL = refresh/bookmark de la page de confirm,
  // PAS un paiement en échec. Le panier n'existe plus → renvoyer vers
  // /order/review afficherait « Données manquantes » (cul-de-sac). On pointe
  // donc vers /order/start (démarrer une commande), pas vers le checkout.
  return (
    <ErrorState
      message="Il n'y a pas de commande à confirmer ici (lien expiré ou page rouverte). Tu peux démarrer une nouvelle commande quand tu veux."
      isInfo
      ctaHref={'/order/start' as Route}
      ctaLabel="Démarrer une commande"
    />
  );
}

/**
 * Détaille un message friendly + actionnable selon le status Stripe.
 * Mapping basé sur https://stripe.com/docs/payments/intents#intent-statuses
 *   - requires_payment_method = carte refusée / 3DS failed → retry avec
 *     autre carte. Le cart est préservé (CartClearOnMount n'a pas fired
 *     sur ce branch), donc retourner à /order/review marche.
 *   - requires_action          = 3DS pending → user doit compléter chez
 *     sa banque (rare ici, Stripe gère normalement l'inline).
 *   - processing               = en cours de capture, normal, refresh.
 *   - canceled                 = annulée (rare, jamais sur succès auto).
 */
function describePendingStatus(status: string): {
  title: string;
  body: string;
  retryable: boolean;
  icon: IconName;
} {
  switch (status) {
    case 'requires_payment_method':
      return {
        icon: 'card',
        title: 'Carte refusée',
        body: 'Ta banque a refusé le paiement. Essaie une autre carte ou contacte ton émetteur. Ton panier est conservé.',
        retryable: true,
      };
    case 'requires_action':
      return {
        icon: 'lock',
        title: 'Vérification 3D Secure requise',
        body: 'Ta banque demande une vérification supplémentaire. Retourne au checkout pour compléter.',
        retryable: true,
      };
    case 'processing':
      return {
        icon: 'info',
        title: 'Paiement en cours…',
        body: 'Stripe finalise la transaction. Cette page se met à jour automatiquement dans quelques secondes.',
        retryable: false,
      };
    case 'canceled':
      return {
        icon: 'x',
        title: 'Paiement annulé',
        body: "Le paiement a été annulé avant d'être confirmé. Tu peux relancer la commande depuis ton panier.",
        retryable: true,
      };
    default:
      return {
        icon: 'info',
        title: 'Paiement en attente',
        body: `Statut Stripe : ${status}. Si tu vois ce message plus de quelques minutes, contacte-nous.`,
        retryable: false,
      };
  }
}

function PendingState({ status, intentId }: { status: string; intentId: string }) {
  const d = describePendingStatus(status);
  // Auto-refresh pour `processing` — capture habituellement < 5s
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 48, textAlign: 'center' }}>
      <div style={{ maxWidth: 520 }}>
        <Icon name={d.icon} size={44} style={{ marginBottom: 16, color: 'var(--text-secondary)' }} />
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, letterSpacing: '-0.025em', fontWeight: 400, margin: '0 0 16px' }}>
          {d.title}
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.5 }}>
          {d.body}
        </p>
        {status === 'processing' && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <meta httpEquiv="refresh" content="6" />
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {d.retryable && (
            <Link href={'/order/review' as Route} className="btn btn-primary">
              {status === 'requires_payment_method' ? 'Essayer une autre carte' : 'Retour au checkout'}
            </Link>
          )}
          <Link
            href={'/orders' as Route}
            className={d.retryable ? 'btn btn-ghost' : 'btn btn-primary'}
          >
            Mes commandes
          </Link>
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 32 }}>
          Référence Stripe : {intentId}
        </p>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  isInfo = false,
  ctaHref = '/order/review' as Route,
  ctaLabel = 'Retour au checkout',
}: {
  message: string;
  isInfo?: boolean;
  /** Cible du CTA principal. Défaut /order/review (cas erreur Stripe : panier
   *  encore là pour retry). ManualConfirmation l'override vers /order/start. */
  ctaHref?: Route;
  ctaLabel?: string;
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 48, textAlign: 'center' }}>
      <div style={{ maxWidth: 480 }}>
        <Icon name={isInfo ? 'info' : 'alert'} size={44} style={{ marginBottom: 16 }} />
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, letterSpacing: '-0.025em', fontWeight: 400, margin: '0 0 16px' }}>
          {isInfo ? 'Confirmation' : 'Erreur'}
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '0 0 32px' }}>{message}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href={ctaHref} className="btn btn-primary">
            {ctaLabel}
          </Link>
          <Link href={'/' as Route} className="btn btn-ghost">
            Accueil
          </Link>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 24 }}>
          Si le problème persiste, écris à{' '}
          <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a>
        </p>
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
