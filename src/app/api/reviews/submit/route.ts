/**
 * POST /api/reviews/submit
 *
 * Submit une review pour une commande livrée. Auth via token HMAC (link
 * dans l'email post-delivery) — pas de login required, le token prouve
 * que le user a accès à l'email du customer original.
 *
 * Body : { orderId, token, rating (1-5), comment?, displayName? }
 *
 * Status créé en PENDING — admin modère via /admin/reviews avant
 * publication landing.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { reviewSubmitToken } from '@/lib/reviews/token';
import { timingSafeStringEqual } from '@/lib/webhooks/sinalite-signature';
import { log } from '@/lib/logger';

const BodySchema = z.object({
  orderId: z.string().min(1),
  token: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  displayName: z.string().max(100).optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const limit = await rateLimit('signin', clientIp(req));
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);

  // Verify token — Audit v2 #6.7 : comparaison constant-time (anti timing
  // attack sur la dérivation du HMAC).
  if (!timingSafeStringEqual(body.token, reviewSubmitToken(body.orderId))) {
    return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 });
  }

  // Order doit exister + status DELIVERED (sinon prematuré pour review)
  const order = await prisma.order.findUnique({
    where: { id: body.orderId },
    include: { user: { select: { firstName: true, name: true, email: true } } },
  });
  if (!order) {
    return NextResponse.json({ error: 'Commande introuvable.' }, { status: 404 });
  }
  if (order.status !== 'DELIVERED') {
    return NextResponse.json(
      { error: 'On t\'envoie un lien de review une fois la commande livrée. Patience !' },
      { status: 400 },
    );
  }

  // Dédup : 1 review max par order. Si déjà submitted → 200 idempotent (pas
  // d'erreur, l'user a peut-être cliqué 2× sur le link email).
  const existing = await prisma.review.findUnique({ where: { orderId: body.orderId } });
  if (existing) {
    return NextResponse.json({ ok: true, alreadySubmitted: true });
  }

  const fallbackName = order.user.firstName ?? order.user.name?.split(' ')[0] ?? order.shipName.split(' ')[0];
  const displayName = body.displayName?.trim() || fallbackName || 'Client Plio';

  await prisma.review.create({
    data: {
      orderId: body.orderId,
      rating: body.rating,
      comment: body.comment?.trim() || null,
      displayName,
      status: 'PENDING',
    },
  });

  log.info({ orderId: body.orderId, rating: body.rating }, 'review submitted');
  return NextResponse.json({ ok: true });
});
