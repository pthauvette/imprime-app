import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';

/**
 * DELETE /api/account/api-keys/[id] — révoque (soft) une clé de l'user connecté.
 *
 * Ownership : findFirst({ id, userId }) → 404 si introuvable OU pas à lui (jamais
 * 403, pour ne pas confirmer l'existence d'une clé d'autrui = anti-énumération).
 * Soft-revoke (revokedAt) : verifyApiKey filtre dessus immédiatement ; on garde la
 * row pour l'audit (et la cohérence avec isKeyUsable).
 */
type RouteCtx = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandler(async (_req: Request, ctx: RouteCtx) => {
  // CSRF (assertSameOrigin) appliqué en amont par withErrorHandler sur les mutations.
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { id } = await ctx.params;

  const key = await prisma.apiKey.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, revokedAt: true },
  });
  if (!key) return NextResponse.json({ error: 'Clé introuvable' }, { status: 404 });

  if (!key.revokedAt) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  }
  return NextResponse.json({ ok: true });
});
