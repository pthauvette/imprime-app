/**
 * DELETE /api/admin/saved-filters/[id]
 *
 * Round 26 #5. Supprime un filtre bookmarké. 403 si le filtre appartient
 * à un autre admin (ownership check explicite — pas juste auth).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';

export const DELETE = withErrorHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;

  const filter = await prisma.adminSavedFilter.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!filter) return NextResponse.json({ error: 'Filtre introuvable' }, { status: 404 });
  if (filter.userId !== guard.userId) {
    return NextResponse.json({ error: 'Pas le propriétaire de ce filtre' }, { status: 403 });
  }

  await prisma.adminSavedFilter.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
