/**
 * GET /api/saved-configs/[id]/redirect
 *
 * Bump l'usage compteur + 302-redirect vers /order/configure pré-rempli.
 * Variante "navigation pure" du POST /[id] (qui retourne un JSON pour les
 * appels client-side). Utilisé par les widgets <a href> qui veulent un
 * vrai lien navigable + suivi par le browser (back-button, etc.).
 *
 * Risque pré-fetch : Next.js pré-fetch certains liens internes. Pour éviter
 * que le compteur soit faussement bumpé, on ne pré-fetch pas (le href est
 * /api/* qui n'est pas pré-fetché par défaut). Si on voulait être ultra-
 * safe on pourrait checker le header `purpose: prefetch` / `next-router-
 * prefetch` et skip le bump — mais le coût d'un faux positif est juste un
 * compteur légèrement gonflé, donc on accepte.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (req: Request, ctx: RouteCtx) => {
  const session = await auth();
  const url = new URL(req.url);
  const origin = url.origin;

  if (!session?.user?.id) {
    // Redirect vers sign-in avec callback qui revient ici → reprend le flow
    // après authentification.
    const { id } = await ctx.params;
    const callback = encodeURIComponent(`/api/saved-configs/${id}/redirect`);
    return NextResponse.redirect(`${origin}/sign-in?callbackUrl=${callback}`, 303);
  }

  const { id } = await ctx.params;
  const config = await prisma.savedConfig.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!config) {
    // Pas trouvé OU pas owner → on redirect au /order/start vide plutôt
    // qu'un 404 (UX plus douce, l'user peut simplement re-démarrer).
    return NextResponse.redirect(`${origin}/order/start`, 303);
  }

  // Bump non-bloquant : si le bump fail (DB transient) on continue le
  // redirect quand même. Une telemetrie ratée vaut mieux qu'un user bloqué.
  prisma.savedConfig
    .update({
      where: { id: config.id },
      data: {
        lastUsedAt: new Date(),
        timesUsed: { increment: 1 },
      },
    })
    .catch(() => {
      // swallow — best effort
    });

  let optionIds: number[] = [];
  try {
    const parsed = JSON.parse(config.optionIds) as unknown;
    if (Array.isArray(parsed)) {
      optionIds = parsed.filter((n): n is number => typeof n === 'number');
    }
  } catch {
    // optionIds corrupted : on tombe sur le wizard avec defaults.
  }

  const wizardUrl = `${origin}/order/configure?productId=${config.productId}&options=${optionIds.join(',')}`;
  return NextResponse.redirect(wizardUrl, 303);
});
