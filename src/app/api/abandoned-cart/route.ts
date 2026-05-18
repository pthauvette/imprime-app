/**
 * POST /api/abandoned-cart
 *
 * Capture / update un cart abandonné. Appelé depuis le wizard quand le
 * user atteint /order/shipping (= email saisi) ou /order/review.
 *
 * Idempotent via upsert sur (email, productId) approximatif — pas de
 * unique constraint stricte parce qu'un user peut commander 2 produits
 * différents. On dédup juste les calls rapprochés en updatant la row
 * existante la plus récente pour ce (email, productId).
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
  // Rate-limit doux — un user normal en touche pas 50 en 1 min
  const limit = await rateLimit('render', clientIp(req));
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);
  const email = body.email.toLowerCase();

  // Cherche un cart existant pour (email, productId) dans les dernières 7j
  // — pas de unique constraint mais le 99 % de cas c'est la même cart en
  // train d'avancer.
  const recent = await prisma.abandonedCart.findFirst({
    where: {
      email,
      productId: body.productId,
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (recent) {
    await prisma.abandonedCart.update({
      where: { id: recent.id },
      data: {
        resumeQuery: body.resumeQuery,
        lastStep: body.lastStep,
        // Reset emailSentAt si user revient travailler sur la cart après
        // avoir reçu le recovery email (= une 2e recovery pourrait être
        // envoyée si il décroche encore une fois).
        emailSentAt: null,
      },
    });
    return NextResponse.json({ ok: true, id: recent.id, updated: true });
  }

  const created = await prisma.abandonedCart.create({
    data: {
      email,
      productId: body.productId,
      resumeQuery: body.resumeQuery,
      lastStep: body.lastStep,
    },
  });
  return NextResponse.json({ ok: true, id: created.id, updated: false });
});
