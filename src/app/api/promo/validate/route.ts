/**
 * POST /api/promo/validate — validate un code promo client-side avant
 * de l'inclure dans la commande.
 *
 * Body : { code, subtotalCents }
 * Returns : ValidationResult (ok=true avec discountCents, ou ok=false avec message)
 *
 * Rate-limited via le bucket 'render' (30 req/min) — empêche le brute-force
 * pour découvrir des codes valides.
 *
 * IMPORTANT : le serveur DOIT re-valider à la création de l'order. Ce call
 * est juste pour le feedback UI immédiat ("Code accepté · 10 $ de rabais").
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { normalizeCode, validatePromo } from '@/lib/promo/validate';

const BodySchema = z.object({
  code: z.string().min(1).max(64),
  subtotalCents: z.number().int().positive(),
});

export const POST = withErrorHandler(async (req: Request) => {
  // Rate-limit AVANT n'importe quel autre travail — empêche brute-force.
  const limit = await rateLimit('render', clientIp(req));
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);
  const code = normalizeCode(body.code);

  const [promo, session] = await Promise.all([
    prisma.promoCode.findUnique({ where: { code } }),
    auth(),
  ]);

  // Pour firstOrderOnly : on regarde le count d'orders de ce user.
  // Pour les guests (pas connectés), on ne peut pas check → on considère
  // orderCountForUser=0, ce qui veut dire que les firstOrderOnly passent.
  // Acceptable parce qu'au moment du checkout l'user crée son user record
  // par email — on re-validera côté /api/orders/create avec le vrai count.
  // Audit-vérif L1 — exclut FAILED/CANCELLED (cohérent avec orders/create + award
  // referral) : une 1re commande échouée ne doit pas consommer le firstOrderOnly.
  let orderCountForUser = 0;
  if (session?.user?.id) {
    orderCountForUser = await prisma.order.count({
      where: { userId: session.user.id, status: { notIn: ['PENDING', 'FAILED', 'CANCELLED'] } },
    });
  }

  const result = validatePromo(promo, {
    subtotalCents: body.subtotalCents,
    orderCountForUser,
  });

  // 200 même si ok=false : c'est du feedback UI, pas une erreur server.
  return NextResponse.json(result);
});
