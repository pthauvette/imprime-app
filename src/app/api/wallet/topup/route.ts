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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';
// Pattern existant : Stripe instancié par route (vs singleton) — meilleur
// pour Next.js Route Handlers serverless (pas de module-level state à
// nettoyer entre requests cold-start).
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
  : null;

const BodySchema = z.object({
  amountCents: z.number().int().positive(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

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

  // Stripe Checkout Session — line_item showing the credit amount + bonus separately
  // pour que le client voie clairement la valeur. Metadata = source of truth pour le webhook.
  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: session.user.email,
    line_items: [
      {
        price_data: {
          currency: 'cad',
          unit_amount: body.amountCents,
          product_data: {
            name: `Top-up wallet Plio — ${(body.amountCents / 100).toFixed(2)} $`,
            description: tier
              ? `Inclut ${(bonusCents / 100).toFixed(2)} $ bonus (${tier.bonusPct} %)`
              : 'Aucun bonus à ce niveau',
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${APP_URL}/wallet?topup=success`,
    cancel_url: `${APP_URL}/wallet?topup=cancelled`,
    metadata: {
      kind: 'wallet_topup',
      userId: session.user.id,
      amountCents: String(body.amountCents),
      bonusCents: String(bonusCents),
      tierLabel: tier?.label ?? '',
      totalCreditCents: String(totalCreditCents),
    },
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
