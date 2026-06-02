/**
 * GET /api/designs/[id]/pdf
 *
 * Retourne le PDF print-ready stocké du DesignDraft. Consommé côté CLIENT par
 * /order/upload (auto-fill recto depuis l'éditeur de template).
 *
 * SÉCURITÉ (Round 1 audit) : un DesignDraft appartient TOUJOURS à un user
 * enregistré (DesignDraft.userId requis). Avant, ce handler n'avait AUCUNE auth
 * (« optional pour MVP ») → IDOR : tout visiteur possédant un id (qui transite
 * en clair dans l'URL navigateur → Referer + logs) récupérait l'artwork
 * print-ready d'un autre client. On exige désormais auth + ownership (ou ADMIN),
 * avec 404 silencieux sinon (ne révèle pas l'existence du draft d'autrui).
 * Calqué sur orders/[id]/invoice.pdf. Le serveur, lui, lit finalPdfUrl direct
 * en DB — il n'appelle jamais cette route, donc l'auth ne casse aucun flux.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { auth } from '@/auth';

const ParamsSchema = z.object({ id: z.string().min(1) });

export const GET = withErrorHandler(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = ParamsSchema.parse(await ctx.params);

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const draft = await prisma.designDraft.findUnique({
    where: { id },
    select: { userId: true, finalPdfUrl: true },
  });

  // Owner-only OU admin. 404 silencieux si introuvable / pas le propriétaire —
  // pas de leak d'existence d'un draft appartenant à un autre user.
  const isOwner = draft?.userId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  if (!draft || (!isOwner && !isAdmin) || !draft.finalPdfUrl) {
    return NextResponse.json({ error: 'Design not found' }, { status: 404 });
  }

  // Le finalPdfUrl est une data: URL — on parse et on stream les bytes
  const match = draft.finalPdfUrl.match(/^data:application\/pdf;base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: 'Invalid stored PDF format' }, { status: 500 });
  }
  const bytes = Buffer.from(match[1], 'base64');

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="design-${id}.pdf"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});
