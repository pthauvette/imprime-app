/**
 * POST /api/wallet/subscription/resume
 *
 * Round 28 #5. Reprend un auto-renew Stripe Subscription qui a été mis
 * en pause via POST /api/wallet/subscription/pause.
 *
 * Stripe : subscriptions.update(id, { pause_collection: null })
 *   - Clear le pause_collection field → billing reprend au prochain
 *     cycle naturel. Pas de charge immédiate, pas de catch-up.
 *
 * Idempotent : si déjà active (pas paused), on no-op.
 * 404 si pas de sub.
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
    return NextResponse.json({ error: "Aucun auto-renew configuré" }, { status: 404 });
  }

  if (!user.walletAutoRenewPausedAt) {
    return NextResponse.json({ ok: true, alreadyActive: true });
  }

  try {
    await stripe.subscriptions.update(user.walletAutoRenewStripeSubId, {
      pause_collection: null,
    });
  } catch (err) {
    log.error({ err, subId: user.walletAutoRenewStripeSubId, userId: session.user.id }, 'stripe sub resume failed');
    return NextResponse.json(
      { error: "Reprise Stripe échouée — réessaie ou contacte support." },
      { status: 500 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { walletAutoRenewPausedAt: null },
  });

  return NextResponse.json({
    ok: true,
    message: "Auto-renew réactivé. Le prochain topup sera au prochain cycle de facturation.",
  });
});
