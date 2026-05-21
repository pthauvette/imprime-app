/**
 * DELETE /api/wallet/subscription
 *
 * Round 22 #3 — annule l'auto-renew Stripe Subscription du user.
 * Le user a 1 sub max (foreign-key style sur User.walletAutoRenewStripeSubId).
 *
 * Workflow :
 *   - Auth required (user must own la sub)
 *   - Stripe API : subscriptions.del(subId, { invoice_now: false })
 *     → la sub est cancel "fin de période" : le user garde son service
 *       jusqu'à la fin du mois déjà payé. Pas de refund prorata.
 *   - User row : nullify walletAutoRenewStripeSubId + amountCents
 *   - Pas d'audit log : c'est une action self-service customer, pas admin.
 *     (Si on veut audit pour customer-side actions, c'est une refactor
 *     plus large à faire séparément.)
 *
 * Note : on ne SUPPRIME pas la sub Stripe-side avec invoice_now=true (qui
 * créerait une facture immédiate pour la période restante) — on cancel
 * at-period-end pour respecter ce que le user a déjà payé.
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { logEmail as log } from '@/lib/logger';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
  : null;

export const DELETE = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { walletAutoRenewStripeSubId: true },
  });

  if (!user?.walletAutoRenewStripeSubId) {
    return NextResponse.json({ error: "Aucun auto-renew actif" }, { status: 404 });
  }

  // Cancel Stripe sub (at period end, respect ce qui est déjà payé)
  try {
    await stripe.subscriptions.update(user.walletAutoRenewStripeSubId, {
      cancel_at_period_end: true,
    });
  } catch (err) {
    log.error({ err, subId: user.walletAutoRenewStripeSubId, userId: session.user.id }, 'stripe sub cancel failed');
    return NextResponse.json(
      { error: "Annulation Stripe échouée — réessaie ou contacte support." },
      { status: 500 },
    );
  }

  // Nullify côté DB. Le webhook customer.subscription.deleted finalisera
  // côté Stripe quand la période actuelle expire — on n'attend pas.
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      walletAutoRenewStripeSubId: null,
      walletAutoRenewAmountCents: null,
    },
  });

  return NextResponse.json({ ok: true, message: "Auto-renew annulé. Tu profites du dernier mois déjà payé." });
});
