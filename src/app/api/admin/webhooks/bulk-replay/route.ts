/**
 * POST /api/admin/webhooks/bulk-replay
 *
 * Round 20 #2 — replay batch de webhook events. Body : { ids: string[] }
 * (max 50 per batch pour éviter d'attendre 5 min sur un seul HTTP call).
 *
 * Réutilise la logique de per-event /replay/route.ts — délégué via un loop.
 * Each event update son outcome individuellement (success ou fail).
 *
 * Retour : { results: [{ id, success, error? }, ...], totalProcessed, totalSucceeded }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { processStripeEvent } from '@/lib/webhooks/stripe-process';
import { processSinaliteEvent, SinaliteWebhookPayload } from '@/lib/webhooks/sinalite-process';
import { logWebhook } from '@/lib/logger';

const BodySchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(50),
});

interface ReplayResult {
  id: string;
  success: boolean;
  error?: string;
  orderId?: string;
}

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);
  const startBatch = Date.now();

  // Fetch tous les events en une query — vérifier qu'ils existent + ont payload.
  const events = await prisma.webhookEvent.findMany({
    where: { id: { in: body.ids } },
  });

  // Dédup contre ce qui a été demandé pour reporter les "introuvables" séparément.
  const foundIds = new Set(events.map((e) => e.id));
  const missingIds = body.ids.filter((id) => !foundIds.has(id));

  const results: ReplayResult[] = missingIds.map((id) => ({
    id,
    success: false,
    error: 'Event introuvable',
  }));

  for (const event of events) {
    if (!event.payload) {
      results.push({ id: event.id, success: false, error: 'NO_PAYLOAD' });
      continue;
    }

    const start = Date.now();
    const handlerCtx: { orderId?: string } = {};
    let replayError: Error | null = null;

    try {
      if (event.source === 'STRIPE') {
        const stripeEvent = JSON.parse(event.payload) as Stripe.Event;
        await processStripeEvent(stripeEvent, handlerCtx);
      } else if (event.source === 'SINALITE') {
        const parsed = SinaliteWebhookPayload.parse(JSON.parse(event.payload));
        await processSinaliteEvent(parsed, handlerCtx);
      } else {
        results.push({ id: event.id, success: false, error: `UNSUPPORTED_SOURCE:${event.source}` });
        continue;
      }
    } catch (err) {
      replayError = err instanceof Error ? err : new Error('Replay error');
      logWebhook.error(
        { err, eventId: event.eventId, source: event.source, batchSize: body.ids.length },
        'bulk replay item failed',
      );
    }

    const latencyMs = Date.now() - start;
    const success = replayError === null;

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

    // Round 26 #3 — historique détaillé (fail-soft).
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

    results.push({
      id: event.id,
      success,
      ...(replayError && { error: replayError.message }),
      ...(handlerCtx.orderId && { orderId: handlerCtx.orderId }),
    });
  }

  const totalSucceeded = results.filter((r) => r.success).length;

  await recordAdminAudit({
    kind: 'ADMIN_WEBHOOK_REPLAY', // Round 1 audit — cohérent avec le replay unitaire
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    data: {
      action: 'WEBHOOK_BULK_REPLAY',
      requested: body.ids.length,
      processed: results.length,
      succeeded: totalSucceeded,
      failed: results.length - totalSucceeded,
      latencyMs: Date.now() - startBatch,
    },
  });

  return NextResponse.json({
    ok: true,
    totalRequested: body.ids.length,
    totalProcessed: results.length,
    totalSucceeded,
    results,
  });
});
