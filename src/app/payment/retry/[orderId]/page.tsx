/**
 * /payment/retry/[orderId]?t=TOKEN
 *
 * Round 25 #5 — self-serve retry après payment_intent.payment_failed.
 *
 * Flow :
 *   1. Verify HMAC token (paymentRetryToken)
 *   2. Look up Order — must be status PENDING or FAILED (pas PAID !)
 *   3. Create un nouveau Stripe Checkout Session avec metadata.orderId
 *   4. redirect() vers session.url (Stripe Checkout)
 *   5. User paye → Stripe fires PI.succeeded + checkout.session.completed
 *   6. Webhook PI handler trouve l'Order via metadata.orderId fallback,
 *      patch paymentIntentId, exécute la flow PAID + Sinalite submit
 *
 * Server Component → zéro JS, le redirect se fait HTTP 302 invisible.
 * Si quoi que ce soit fail (token invalide, order already PAID, Stripe
 * erreur), on render une page d'erreur friendly avec un lien support.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { verifyPaymentRetryToken } from '@/lib/payment/retry-token';
import { logStripe as log } from '@/lib/logger';
import { Icon } from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reprendre le paiement' };

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
  : null;

type ErrCode =
  | 'invalid_token'
  | 'order_not_found'
  | 'order_already_paid'
  | 'order_cancelled'
  | 'order_verification_en_cours'
  | 'stripe_unconfigured'
  | 'stripe_failed';

export default async function PaymentRetryPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ t?: string; cancelled?: string }>;
}) {
  const { orderId } = await params;
  const { t: token, cancelled } = await searchParams;

  // 1. Token vérification (constant-time)
  if (!token || !verifyPaymentRetryToken(orderId, token)) {
    return <ErrorPage code="invalid_token" />;
  }

  // finding [47] — `cancel_url` de Stripe pointe VERS CETTE PAGE avec
  // `&cancelled=1`. Avant, ce paramètre n'était jamais lu : la page
  // redirigeait automatiquement vers une NOUVELLE session Stripe dès le
  // chargement, donc « annuler » sur Stripe → retour ici → re-redirect
  // immédiat vers Stripe → boucle. On casse la boucle en s'arrêtant ici :
  // il faut un clic explicite pour relancer un essai de paiement.
  if (cancelled === '1') {
    return <PaymentCancelledPage orderId={orderId} token={token} />;
  }

  // 2. Order lookup + state check
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { email: true } },
    },
  });

  if (!order) return <ErrorPage code="order_not_found" />;
  if (order.status === 'PAID' || order.status === 'IN_PRODUCTION' || order.status === 'SHIPPED' || order.status === 'DELIVERED') {
    return <ErrorPage code="order_already_paid" />;
  }
  if (order.status === 'CANCELLED') {
    return <ErrorPage code="order_cancelled" />;
  }
  // ⚠️ ARGENT DÉJÀ ENCAISSÉ, ISSUE DE PRODUCTION INCONNUE → NE PAS REPRENDRE.
  //
  // Ce garde existe à cause d'un état que le marqueur d'incertitude rend
  // COURANT : une soumission partie sans réponse laisse la commande FAILED,
  // `paidAt` posé, et l'argent CONSERVÉ (on ne rembourse plus sur un doute,
  // parce que la production est peut-être lancée). Or FAILED passait ici — le
  // test au-dessus ne bloque que PAID/IN_PRODUCTION/SHIPPED/DELIVERED — et le
  // lien de reprise envoyé par `sendPaymentFailedEmail` n'expire pas. Le
  // client rouvrait un vieux courriel « paiement refusé », cliquait, et
  // payait une SECONDE fois une commande déjà encaissée. Pire : le webhook du
  // second paiement écrase `paymentIntentId`, ce qui rend le PREMIER débit —
  // le seul non remboursé — introuvable pour tous les gardes en aval, qui
  // interrogent `charges.list({ payment_intent: order.paymentIntentId })`.
  //
  // ⚠️ LE DISCRIMINANT EST LE MARQUEUR, PAS `paidAt`. Une commande refusée
  // AVANT création est remboursée puis marquée FAILED : elle porte donc
  // `paidAt` elle aussi, et sa reprise est parfaitement légitime — c'est le
  // cas d'usage même de cette page. Bloquer sur `paidAt` la casserait.
  if (order.sinaliteSubmitUncertainAt) {
    return <ErrorPage code="order_verification_en_cours" />;
  }

  if (!stripe) {
    log.error({ orderId }, 'payment-retry: STRIPE_SECRET_KEY not configured');
    return <ErrorPage code="stripe_unconfigured" />;
  }

  // 3. Create Checkout Session. Metadata.orderId est lu en webhook fallback
  //    (cf stripe-process.ts) → patch Order.paymentIntentId = new PI id +
  //    déclenche le flow PAID + Sinalite submit comme un nouveau paiement.
  const email = order.user?.email ?? undefined;
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      ...(email && { customer_email: email }),
      line_items: [
        {
          price_data: {
            currency: (order.currency ?? 'cad').toLowerCase(),
            unit_amount: order.amountCents,
            product_data: {
              name: order.productSummary ?? `Commande Plio #${order.id.slice(-6).toUpperCase()}`,
              description: `Reprise du paiement pour la commande #${order.id.slice(-6).toUpperCase()}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: 'order-retry',
        orderId: order.id,
      },
      // Très important : copier orderId sur le PI lui-même via payment_intent_data.
      // C'est ce metadata que le webhook PI handler lit en fallback pour
      // matcher l'Order existante.
      payment_intent_data: {
        metadata: {
          orderId: order.id,
          kind: 'order-retry',
        },
      },
      success_url: `${APP_URL}/orders/${order.id}?retry=success`,
      cancel_url: `${APP_URL}/payment/retry/${order.id}?t=${token}&cancelled=1`,
    }, {
      // Audit 2026-07 #1 (HIGH, money-path) — idempotencyKey déterministe dérivé de
      // l'orderId. Cette page est un Server Component : CHAQUE GET (double-clic sur le
      // lien, bouton retour, retry réseau) rappelait ce create → N sessions/PI
      // facturables distinctes → 2e charge encaissé et JAMAIS remboursé. Avec cette clé,
      // les rechargements collapsent vers UNE seule Session → une seule surface de
      // paiement. Params déterministes (montant immuable) → pas de mismatch Stripe. La
      // fenêtre d'idempotence Stripe (24 h) s'aligne sur l'expiration par défaut de la
      // Session. Le patron correct vit déjà dans mcp/checkout-session.ts (`mcp_cs_…`).
      idempotencyKey: `retry_cs_${order.id}`,
    });
  } catch (err) {
    log.error({ err, orderId }, 'payment-retry: Stripe checkout session create failed');
    return <ErrorPage code="stripe_failed" />;
  }

  if (!session.url) {
    log.error({ orderId, sessionId: session.id }, 'payment-retry: Stripe session has no URL');
    return <ErrorPage code="stripe_failed" />;
  }

  // 4. redirect() lance un HTTP 302 vers Stripe Checkout.
  //    Cast nécessaire car typedRoutes (next.config) restreint redirect()
  //    aux routes internes — Stripe Checkout est externe par construction.
  redirect(session.url as unknown as Route);
}

function PaymentCancelledPage({ orderId, token }: { orderId: string; token: string }) {
  // Lien SANS `cancelled=1` : un clic relance le flow normal (auto-redirect
  // vers une nouvelle session Stripe), mais seulement sur action explicite.
  const retryHref = `/payment/retry/${orderId}?t=${token}` as unknown as Route;
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
      <div style={{ marginBottom: 16 }}><Icon name="info" size={44} /></div>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 32,
        fontWeight: 400,
        letterSpacing: '-0.02em',
        margin: '0 0 12px',
      }}>
        Paiement annulé
      </h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
        Ta commande n&apos;a pas été facturée. Tu peux réessayer quand tu veux — le lien reste valide.
      </p>
      <Link
        href={retryHref}
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: 'var(--accent-primary)',
          color: 'var(--text-on-accent)',
          borderRadius: 'var(--r-pill)',
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Réessayer le paiement →
      </Link>
    </main>
  );
}

function ErrorPage({ code }: { code: ErrCode }) {
  const MSG: Record<ErrCode, { title: string; body: string; cta?: string; href?: string }> = {
    invalid_token: {
      title: 'Lien invalide ou expiré',
      body: 'Ce lien de paiement ne correspond à aucune commande active. Si tu reçois cet email d\'un envoi récent, contacte-nous pour qu\'on regarde ce qui s\'est passé.',
      cta: 'Contacter le support',
      href: '/contact',
    },
    order_not_found: {
      title: 'Commande introuvable',
      body: 'Impossible de retrouver cette commande. Le numéro a peut-être expiré, ou il y a une erreur dans le lien.',
      cta: 'Voir mes commandes',
      href: '/account',
    },
    order_already_paid: {
      title: 'Cette commande est déjà payée',
      body: 'Bonne nouvelle — le paiement a déjà été enregistré pour cette commande. Tu peux suivre l\'avancement depuis ton compte.',
      cta: 'Voir la commande',
      href: '/account',
    },
    order_verification_en_cours: {
      title: 'On vérifie cette commande',
      body:
        "Ton paiement a bien été reçu. Une vérification est en cours auprès de notre imprimeur avant " +
        "de lancer la production — ça ne demande rien de ta part. Surtout, ne repaie pas : tu serais " +
        "débité une seconde fois. On te confirme tout par courriel dès que c'est réglé.",
      cta: 'Nous écrire',
      href: '/contact',
    },
    order_cancelled: {
      title: 'Cette commande a été annulée',
      body: 'Pas possible de reprendre une commande annulée. Tu peux en commencer une nouvelle quand tu veux.',
      cta: 'Recommencer',
      href: '/order/start',
    },
    stripe_unconfigured: {
      title: 'Erreur de configuration',
      body: 'Le paiement n\'est pas disponible en ce moment. Écris-nous, on règle ça.',
      cta: 'Contacter le support',
      href: '/contact',
    },
    stripe_failed: {
      title: 'Erreur du processeur de paiement',
      body: 'Stripe a refusé de créer la session de paiement. Réessaye dans une minute, ou contacte-nous si le problème persiste.',
      cta: 'Contacter le support',
      href: '/contact',
    },
  };
  const msg = MSG[code];

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
      <div style={{ marginBottom: 16 }}><Icon name="refresh" size={44} /></div>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 32,
        fontWeight: 400,
        letterSpacing: '-0.02em',
        margin: '0 0 12px',
      }}>
        {msg.title}
      </h1>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
        {msg.body}
      </p>
      {msg.cta && msg.href && (
        <Link
          href={msg.href as unknown as Route}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            background: 'var(--accent-primary)',
            color: 'var(--text-on-accent)',
            borderRadius: 'var(--r-pill)',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {msg.cta} →
        </Link>
      )}
    </main>
  );
}
