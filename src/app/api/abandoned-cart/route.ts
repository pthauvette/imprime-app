/**
 * POST /api/abandoned-cart
 *
 * Capture / update un cart abandonné. Appelé depuis le wizard quand le
 * user atteint /order/shipping ou /order/review.
 *
 * Round 16 #4 : refactored à `prisma.upsert` sur UNIQUE (email, productId)
 * — atomique côté DB, fix la race condition (2 POSTs concurrents qui
 * créaient 2 rows). Migration : 20260520000000_abandoned_cart_unique.
 *
 * Anti-spam : rate-limit par IP + email lowercased + length cap. Le risque
 * de "pollution" (POST avec email arbitraire) est limité par :
 *   - rate-limit IP (15 req/min)
 *   - le cron de recovery cap aussi à 50 emails/run avec dedup label
 *   - email-retry queue marquerait DEAD si l'email bounce
 * Pour MVP on n'ajoute pas de HMAC token (complexifie le wizard side qui
 * est purely client). Si la pollution devient un problème, on peut bind
 * le POST à un cookie session-id posé par middleware.
 *
 * Body : { email, productId, resumeQuery, lastStep }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';

const BodySchema = z.object({
  email: z.string().trim().email().max(150),
  productId: z.number().int().positive(),
  resumeQuery: z.string().max(2000),
  lastStep: z.enum(['configure', 'quantity', 'upload', 'shipping', 'review']),
});

export const POST = withErrorHandler(async (req: Request) => {
  const limit = await rateLimit('render', clientIp(req));
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);
  const email = body.email.toLowerCase();

  // Atomic upsert sur UNIQUE (email, productId). Si la row existe → update
  // resumeQuery/lastStep + reset emailSentAt (le user revient sur la cart
  // après avoir reçu un recovery — re-éligible pour une 2e recovery s'il
  // décroche encore). Sinon → create.
  const cart = await prisma.abandonedCart.upsert({
    where: {
      email_productId: { email, productId: body.productId },
    },
    update: {
      resumeQuery: body.resumeQuery,
      lastStep: body.lastStep,
      emailSentAt: null,
    },
    create: {
      email,
      productId: body.productId,
      resumeQuery: body.resumeQuery,
      lastStep: body.lastStep,
    },
  });

  return NextResponse.json({ ok: true, id: cart.id });
});
