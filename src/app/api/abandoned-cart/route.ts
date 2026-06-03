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
 * Anti-spam : rate-limit par IP ET PAR EMAIL (Audit v2 #6.5) + email lowercased
 * + length cap. Le risque de "pollution" (POST avec email tiers arbitraire pour
 * spammer une victime via les recovery emails — violation CASL) est limité par :
 *   - rate-limit IP (bucket 'render', 30/min) → bloque l'enrôlement en masse
 *   - rate-limit EMAIL (bucket 'abandonedCart', 5/h) → bloque le ré-enrôlement
 *     répété d'une même victime (chaque capture reset emailSentAt, donc sans ce
 *     garde un attaquant pouvait re-déclencher une recovery à chaque cron run)
 *   - le cron de recovery cap aussi à 50 emails/run avec dedup label
 *   - email-retry queue marque DEAD si l'email bounce
 *   - chaque recovery email porte un lien unsubscribe (CASL body-level)
 * Bind à un cookie de session signé reste un durcissement futur possible.
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

  // Audit v2 #6.5 — rate-limit PAR EMAIL (anti ré-enrôlement d'une victime).
  const emailLimit = await rateLimit('abandonedCart', email);
  if (!emailLimit.ok) return emailLimit.response;

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
