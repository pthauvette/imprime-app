/**
 * POST /api/wallet/topup
 *
 * Crée une Stripe Checkout Session pour un top-up wallet.
 * Le webhook Stripe (/api/webhooks/stripe) reagira sur
 * `checkout.session.completed` avec metadata.kind='wallet_topup' pour
 * créditer le wallet (processWalletTopup).
 *
 * Round 18 #1 — body : { amountCents }. Bonus calculé server-side.
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { auth } from '@/auth';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { tierForAmount, computeBonus, isValidTopupAmount } from '@/lib/wallet/tiers';
import { rateLimit } from '@/lib/ratelimit';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';
// Pattern existant : Stripe instancié par route (vs singleton) — meilleur
// pour Next.js Route Handlers serverless (pas de module-level state à
// nettoyer entre requests cold-start).
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
  : null;

const BodySchema = z.object({
  amountCents: z.number().int().positive(),
  /** Round 22 #3 — true = Stripe Subscription monthly recurring,
   *  false (default) = one-shot Checkout Session. */
  autoRenew: z.boolean().optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  // Borné PAR UTILISATEUR (la route exige déjà une session) : empêche qu'une
  // boucle de retry côté client ou une session compromise crée des Checkout
  // Sessions en rafale.
  const limit = await rateLimit('walletTopup', session.user.id);
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);
  if (!isValidTopupAmount(body.amountCents)) {
    return NextResponse.json(
      { error: 'Montant invalide (10 $ à 10 000 $)' },
      { status: 400 },
    );
  }

  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const tier = tierForAmount(body.amountCents);
  const bonusCents = computeBonus(body.amountCents);
  const totalCreditCents = body.amountCents + bonusCents;
  const isSubscription = body.autoRenew === true;

  // Round 22 #3 — Stripe Checkout mode='subscription' pour auto-renew.
  // Diff vs one-shot : recurring=month, subscription_data.metadata =
  // copied to invoice.metadata pour que les webhooks invoice.paid puissent
  // identifier le wallet user. Pour MVP : 1 sub max par user (le composer
  // côté UI refuse de créer une 2e si une existe déjà — cf route /api/wallet/subscription).
  const metadata = {
    kind: 'wallet_topup',
    userId: session.user.id,
    amountCents: String(body.amountCents),
    bonusCents: String(bonusCents),
    tierLabel: tier?.label ?? '',
    totalCreditCents: String(totalCreditCents),
  };

  const checkout = await stripe.checkout.sessions.create({
    mode: isSubscription ? 'subscription' : 'payment',
    payment_method_types: ['card'],
    customer_email: session.user.email,
    line_items: [
      {
        price_data: {
          currency: 'cad',
          unit_amount: body.amountCents,
          ...(isSubscription && { recurring: { interval: 'month' as const } }),
          product_data: {
            name: isSubscription
              ? `Top-up auto mensuel — ${(body.amountCents / 100).toFixed(2)} $`
              : `Top-up wallet Plio — ${(body.amountCents / 100).toFixed(2)} $`,
            description: tier
              ? `Inclut ${(bonusCents / 100).toFixed(2)} $ bonus (${tier.bonusPct} %)${isSubscription ? ' chaque mois' : ''}`
              : 'Aucun bonus à ce niveau',
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${APP_URL}/wallet?topup=success${isSubscription ? '&sub=1' : ''}`,
    cancel_url: `${APP_URL}/wallet?topup=cancelled`,
    metadata,
    // En subscription mode, on copy metadata sur le Subscription object
    // pour que les invoice.paid futures sachent quoi crediter.
    ...(isSubscription && {
      subscription_data: { metadata },
    }),
  });

  return NextResponse.json({
    ok: true,
    checkoutUrl: checkout.url,
    sessionId: checkout.id,
    summary: {
      amountCents: body.amountCents,
      bonusCents,
      totalCreditCents,
      tierLabel: tier?.label ?? null,
    },
  });
});
