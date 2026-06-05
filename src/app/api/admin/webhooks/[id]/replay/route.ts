/**
 * POST /api/admin/webhooks/[id]/replay
 *
 * Re-exécute manuellement la business logic d'un WebhookEvent stocké.
 *
 * Use case : un webhook a échoué (ex: payment_intent.succeeded mais Sinalite
 * était down). Plutôt que d'attendre les retries de Stripe (qui s'arrêtent
 * après 3 jours), admin peut re-déclencher manuellement après avoir corrigé
 * la cause root.
 *
 * Approche :
 *   - Le payload original est stocké dans WebhookEvent.payload (depuis la
 *     migration add_webhook_event_payload — les rows historiques pré-migration
 *     ne peuvent pas être replayed).
 *   - On bypass signature + dedup (déjà passés à l'origine) et on call
 *     directement processStripeEvent / processSinaliteEvent.
 *   - L'outcome (success/error/latency) est patché sur la row WebhookEvent
 *     existante. On incrémente replayCount + lastReplayAt pour traçabilité.
 *   - Audit log dans AdminAuditEvent.
 *
 * Erreurs :
 *   - 404 si l'id n'existe pas
 *   - 409 si payload null (pré-migration ou source non supportée)
 *   - 502 si le handler relancé throw — on remonte l'erreur pour debug
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { updateWebhookOutcome } from '@/lib/db/orders';
import { processStripeEvent } from '@/lib/webhooks/stripe-process';
import { processSinaliteEvent, SinaliteWebhookPayload } from '@/lib/webhooks/sinalite-process';
import { logWebhook } from '@/lib/logger';

export const POST = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;

  const event = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json({ error: 'Webhook event introuvable' }, { status: 404 });
  }

  if (!event.payload) {
    return NextResponse.json(
      {
        error: 'Payload absent — cet événement est antérieur à la fonctionnalité de replay (migration add_webhook_event_payload). Les events postérieurs au 18 mai 2026 peuvent être rejoués.',
        code: 'NO_PAYLOAD',
      },
      { status: 409 },
    );
  }

  const start = Date.now();
  const handlerCtx: { orderId?: string; unknown?: boolean } = {};
  let replayError: Error | null = null;

  try {
    if (event.source === 'STRIPE') {
      // Parse JSON brut depuis le payload — on bypass signature verification
      // car la signature a déjà été vérifiée à l'origine.
      const stripeEvent = JSON.parse(event.payload) as Stripe.Event;
      await processStripeEvent(stripeEvent, handlerCtx);
    } else if (event.source === 'SINALITE') {
      const parsed = SinaliteWebhookPayload.parse(JSON.parse(event.payload));
      await processSinaliteEvent(parsed, handlerCtx);
    } else {
      return NextResponse.json(
        { error: `Source non supportée : ${event.source}`, code: 'UNSUPPORTED_SOURCE' },
        { status: 409 },
      );
    }
  } catch (err) {
    replayError = err instanceof Error ? err : new Error('Replay error');
    logWebhook.error(
      { err, eventId: event.eventId, source: event.source, replayingAs: guard.user.email },
      'admin replay failed',
    );
  }

  const latencyMs = Date.now() - start;
  const success = replayError === null;

  // Update outcome AND increment replayCount + lastReplayAt en un seul UPDATE.
  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: {
      success,
      statusCode: success ? 200 : 500,
      latencyMs,
      error: replayError ? replayError.message.slice(0, 500) : null,
      ...(handlerCtx.orderId ? { orderId: handlerCtx.orderId } : {}),
      replayCount: { increment: 1 },
      lastReplayAt: new Date(),
    },
  });

  // Round 26 #3 — historique détaillé. Fail-soft : si le insert plante,
  // on log mais on ne casse pas la réponse au caller (l'aggregate count
  // ci-dessus est déjà à jour).
  void prisma.webhookReplay.create({
    data: {
      webhookEventId: event.id,
      replayedBy: guard.userId,
      replayedByEmail: guard.user.email,
      success,
      statusCode: success ? 200 : 500,
      errorMessage: replayError ? replayError.message.slice(0, 500) : null,
      latencyMs,
    },
  }).catch((err) => {
    logWebhook.warn({ err, eventId: event.id }, 'webhookReplay history insert failed (non-fatal)');
  });

  // Audit log — admin action sensible, on trace
  await recordAdminAudit({
    kind: 'ADMIN_WEBHOOK_REPLAY', // Round 1 audit — kind dédié (était ADMIN_TEMPLATE_EDIT)
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    targetId: handlerCtx.orderId,
    data: {
      action: 'WEBHOOK_REPLAY',
      webhookEventId: event.id,
      source: event.source,
      eventType: event.eventType,
      originalEventId: event.eventId,
      success,
      latencyMs,
      ...(replayError && { error: replayError.message }),
    },
  });

  if (!success) {
    return NextResponse.json(
      {
        ok: false,
        error: replayError?.message ?? 'Unknown replay error',
        latencyMs,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    latencyMs,
    orderId: handlerCtx.orderId,
    unknown: handlerCtx.unknown,
  });

  // The unused updateWebhookOutcome helper is intentionally NOT called here :
  // we update the row directly above so we can ALSO bump replayCount in the
  // same query. updateWebhookOutcome's broader use elsewhere remains.
  void updateWebhookOutcome;
});
