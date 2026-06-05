/**
 * POST /api/nps
 *
 * Customer submit NPS feedback pour un order. Auth = ownership : le user
 * connecté doit posséder l'order, sinon 403.
 *
 * Idempotent : 1 réponse max par order (UNIQUE constraint). Si déjà
 * répondu → upsert (update du score). Permet au user de réviser sa
 * note s'il a cliqué par erreur.
 *
 * Body : { orderId: string, score: 0..10, comment?: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import { logEmail } from '@/lib/logger';

const BodySchema = z.object({
  orderId: z.string().min(20).max(40),
  score: z.number().int().min(0).max(10),
  comment: z.string().max(2000).optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Connexion requise' }, { status: 401 });
  }

  const body = await parseBody(req, BodySchema);

  // Ownership check : l'order doit appartenir au user (ou il est admin).
  const order = await prisma.order.findUnique({
    where: { id: body.orderId },
    select: { id: true, userId: true, status: true },
  });
  if (!order) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  }
  if (order.userId !== session.user.id && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  // Best practice : ne pas accepter de NPS sur des orders pas livrées
  // (le user ne peut pas vraiment juger l'expérience finale)
  if (order.status !== 'DELIVERED') {
    return NextResponse.json(
      { error: 'NPS disponible seulement une fois la commande livrée' },
      { status: 400 },
    );
  }

  const trimmed = body.comment?.trim() || null;

  await prisma.npsResponse.upsert({
    where: { orderId: body.orderId },
    create: {
      orderId: body.orderId,
      score: body.score,
      comment: trimmed,
    },
    update: {
      score: body.score,
      comment: trimmed,
    },
  });

  // Slack alert pour les detractors (0-6) avec commentaire — feedback
  // critique qui mérite une intervention admin rapide.
  if (body.score <= 6 && trimmed) {
    await sendCriticalAlert({
      severity: 'warning',
      title: `🚨 NPS detractor (${body.score}/10) avec feedback`,
      body: trimmed.slice(0, 500) + (trimmed.length > 500 ? '…' : ''),
      context: {
        orderId: body.orderId,
        userId: session.user.id,
        score: body.score,
      },
      actionUrl: `/admin/orders/${body.orderId}`,
      actionLabel: 'Voir la commande',
    });
  }

  logEmail.info(
    { orderId: body.orderId, score: body.score, hasComment: !!trimmed },
    'nps response recorded',
  );

  return NextResponse.json({ ok: true });
});
