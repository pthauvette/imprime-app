/**
 * /api/saved-configs/[id]
 *  - DELETE : supprime une config (vérifie ownership)
 *  - PUT    : renomme une config (body { name })
 *  - POST   : marque comme utilisée (bumps lastUsedAt + timesUsed) et
 *             retourne l'URL de deep-link vers le wizard.
 *
 * Toutes les routes 404 si la config existe mais appartient à un autre user
 * — pas 403 pour éviter l'oracle d'énumération (l'attaquant peut pas
 * distinguer "n'existe pas" de "appartient à quelqu'un d'autre").
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';

type RouteCtx = { params: Promise<{ id: string }> };

const RenameSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  // Round 18 #2 — folder/tags update via même endpoint pour simplicité.
  // null explicite = retirer du folder. undefined = ne pas toucher.
  folder: z.string().trim().min(1).max(50).nullable().optional(),
  /** Tags CSV — server normalise lowercase + dédup + max 10 tags. */
  tags: z.string().max(300).nullable().optional(),
});

async function getOwnedConfig(id: string, userId: string) {
  return prisma.savedConfig.findFirst({ where: { id, userId } });
}

export const DELETE = withErrorHandler(async (_req: Request, ctx: RouteCtx) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const config = await getOwnedConfig(id, session.user.id);
  if (!config) {
    return NextResponse.json({ error: 'Config introuvable' }, { status: 404 });
  }

  await prisma.savedConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});

export const PUT = withErrorHandler(async (req: Request, ctx: RouteCtx) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const config = await getOwnedConfig(id, session.user.id);
  if (!config) {
    return NextResponse.json({ error: 'Config introuvable' }, { status: 404 });
  }

  const body = await parseBody(req, RenameSchema);

  // Round 18 #2 — normalize folder + tags
  const updateData: { name?: string; folder?: string | null; tags?: string | null } = {};
  if (body.name) updateData.name = body.name.trim();
  if (body.folder !== undefined) {
    updateData.folder = body.folder === null ? null : body.folder.toLowerCase().trim();
  }
  if (body.tags !== undefined) {
    if (body.tags === null || body.tags.trim() === '') {
      updateData.tags = null;
    } else {
      // Normalize : lowercase, trim, dedupe, cap à 10 tags max
      const tagList = Array.from(new Set(
        body.tags.split(',').map((t) => t.toLowerCase().trim()).filter(Boolean),
      )).slice(0, 10);
      updateData.tags = tagList.join(',');
    }
  }

  const updated = await prisma.savedConfig.update({
    where: { id },
    data: updateData,
  });
  return NextResponse.json({ config: updated });
});

/**
 * POST = marquer comme utilisée + retourner l'URL deep-link. Le client redirect
 * ensuite vers cette URL. On préfère cette indirection à un GET car ça
 * permet d'incrémenter le compteur côté serveur de manière atomique sans
 * que les pré-fetch / link previewers le déclenchent par erreur.
 */
export const POST = withErrorHandler(async (_req: Request, ctx: RouteCtx) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const config = await getOwnedConfig(id, session.user.id);
  if (!config) {
    return NextResponse.json({ error: 'Config introuvable' }, { status: 404 });
  }

  const updated = await prisma.savedConfig.update({
    where: { id },
    data: {
      lastUsedAt: new Date(),
      timesUsed: { increment: 1 },
    },
  });

  // Le wizard /order/configure accepte ?productId=X&options=ID1,ID2,...
  // qui pré-remplit la sélection (cf. configure/page.tsx prefilledOptionIds).
  // L'user voit les options déjà cochées et peut juste cliquer "Suivant".
  let optionIds: number[] = [];
  try {
    const parsed = JSON.parse(updated.optionIds) as unknown;
    if (Array.isArray(parsed)) {
      optionIds = parsed.filter((n): n is number => typeof n === 'number');
    }
  } catch {
    // optionIds corrupted in DB — fallback to empty, wizard uses default.
  }

  const url = `/order/configure?productId=${updated.productId}&options=${optionIds.join(',')}`;
  return NextResponse.json({ url, config: updated });
});
