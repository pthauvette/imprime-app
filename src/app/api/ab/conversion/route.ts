/**
 * POST /api/ab/conversion
 *
 * Log une conversion A/B pour le visiteur courant (cookie plio_vid).
 * Pas d'auth requise — un visiteur anonyme peut convertir.
 *
 * Usage typique :
 *   1. Customer place un order → /api/orders/create POST appelle
 *      recordConversion({ goal: 'order_placed', value: amountCents })
 *      directement (pas besoin de passer par cette route).
 *   2. UI events (button click, scroll past X) → fetch POST ici depuis
 *      le browser (cookie envoyé automatiquement).
 *
 * Body : { goal: string, value?: number, experimentIds?: string[] }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { recordConversion, getVisitorId } from '@/lib/ab/experiments';

const BodySchema = z.object({
  goal: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/, 'goal: lowercase letters/digits/underscore only'),
  value: z.number().int().optional(),
  experimentIds: z.array(z.string().min(1).max(80)).max(20).optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  // Rate-limit doux — un visiteur normal ne convertit pas 100x/min
  const limit = await rateLimit('render', clientIp(req));
  if (!limit.ok) return limit.response;

  const visitorId = await getVisitorId();
  if (!visitorId) {
    // Pas de visitor cookie = pas dans une exp = no-op (200 pour pas
    // bruyant côté client).
    return NextResponse.json({ ok: true, tracked: false, reason: 'no_visitor_id' });
  }

  const body = await parseBody(req, BodySchema);

  await recordConversion({
    visitorId,
    goal: body.goal,
    value: body.value,
    experimentIds: body.experimentIds,
  });

  return NextResponse.json({ ok: true, tracked: true });
});
