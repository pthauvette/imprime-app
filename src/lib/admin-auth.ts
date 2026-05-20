/**
 * Admin guards pour Server Components + API routes.
 *
 * Le middleware déjà gate /admin/* — mais les API routes /api/admin/* sont
 * sous /api/ qui est excluded du matcher du middleware. Donc on doit guard
 * ici aussi.
 */

import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import type { User } from '@prisma/client';
import { prisma } from '@/lib/db';

/**
 * Garde pour les Server Component pages /admin/* — defense-in-depth.
 *
 * Le middleware (src/middleware.ts) gate déjà /admin/* à l'edge, mais
 * si le matcher est modifié ou si un RSC streaming bypass arrive, cette
 * fonction est un second rempart : redirect immédiat.
 *
 * Returns la session pour que la page puisse s'en servir (sidebar user).
 *
 *   const { session } = await requireAdminPage();
 *
 * Si non-authentifié → redirect /sign-in. Si authentifié non-ADMIN →
 * notFound() (pas 403 pour ne pas leak l'existence de /admin/*).
 */
export async function requireAdminPage(): Promise<{ session: Session }> {
  const session = await auth();
  if (!session?.user?.id) {
    const { redirect } = await import('next/navigation');
    redirect('/sign-in?callbackUrl=/admin');
    // unreachable — redirect throws — needed for TS narrowing
    throw new Error('redirected');
  }
  if (session.user.role !== 'ADMIN') {
    const { notFound } = await import('next/navigation');
    notFound();
    throw new Error('not found');
  }
  return { session };
}

/**
 * Garde pour les API routes : retourne une 401/403 si le caller n'est pas
 * un admin authentifié, sinon le User complet.
 */
export async function requireAdmin(): Promise<
  | { ok: true; user: User; userId: string }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (session.user.role !== 'ADMIN') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 }),
    };
  }
  // Récupère le User complet pour audit log (l'admin qui a fait l'action)
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'User not found' }, { status: 401 }),
    };
  }
  return { ok: true, user, userId: user.id };
}
