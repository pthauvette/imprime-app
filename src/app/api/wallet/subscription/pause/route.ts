/**
 * POST /api/wallet/subscription/pause
 *
 * Round 28 #5. Met en pause l'auto-renew Stripe sans cancel.
 * Use case : customer en congé sabbatique, reseller en slow season —
 * veut garder son sub mais skip les prochains topup.
 *
 * Vs DELETE (cancel) : pause préserve le subscription Stripe + la card
 * + le tier bonus snapshot. Resume = 1 click, pas de re-saisie.
 *
 * Stripe : subscriptions.update(id, { pause_collection: { behavior: 'mark_uncollectible' }})
 *   - behavior 'mark_uncollectible' : les invoices futures sont créées mais
 *     marked uncollectible automatiquement → pas de charge. À unpause,
 *     on clear pause_collection, billing reprend au prochain cycle.
 *   - vs 'void' (delete invoices) : on garde le record pour audit.
 *
 * Idempotent : si déjà paused, on no-op. 404 si pas de sub active.
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

export const POST = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { walletAutoRenewStripeSubId: true, walletAutoRenewPausedAt: true },
  });

  if (!user?.walletAutoRenewStripeSubId) {
    return NextResponse.json({ error: "Aucun auto-renew actif" }, { status: 404 });
  }

  // Idempotent : already paused → no-op
  if (user.walletAutoRenewPausedAt) {
    return NextResponse.json({ ok: true, alreadyPaused: true });
  }

  try {
    await stripe.subscriptions.update(user.walletAutoRenewStripeSubId, {
      pause_collection: { behavior: 'mark_uncollectible' },
    });
  } catch (err) {
    log.error({ err, subId: user.walletAutoRenewStripeSubId, userId: session.user.id }, 'stripe sub pause failed');
    return NextResponse.json(
      { error: "Pause Stripe échouée — réessaie ou contacte support." },
      { status: 500 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { walletAutoRenewPausedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    message: "Auto-renew mis en pause. Aucune charge le mois prochain. Click Resume pour réactiver quand tu veux.",
  });
});
