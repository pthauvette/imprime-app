/**
 * /api/saved-configs
 *  - GET  : liste les configs sauvegardées du user courant
 *  - POST : sauvegarde une nouvelle config (déduplication par optionIds
 *           identiques pour le même productId → renvoie la config existante
 *           sans en créer une nouvelle, pour éviter le spam de doublons).
 *
 * Auth requise — pas de configs anonymes. Si user pas connecté on retourne
 * 401, le client redirect vers /sign-in.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  productId: z.number().int().positive(),
  productName: z.string().min(1).max(200),
  optionIds: z.array(z.number().int().positive()).min(1).max(20),
  summary: z.string().min(1).max(300),
});

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const configs = await prisma.savedConfig.findMany({
    where: { userId: session.user.id },
    // Sort : most recently used first, fallback created (most recently saved
    // mais jamais utilisée encore).
    orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 50,
  });

  return NextResponse.json({ configs });
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await parseBody(req, CreateSchema);
  const sortedIds = [...body.optionIds].sort((a, b) => a - b);
  const serialized = JSON.stringify(sortedIds);

  // Déduplication : si même user + productId + optionIds (canonical sorted)
  // → renvoie l'existant avec un flag `duplicate`. Évite le spam si l'user
  // clique 2× sur "Sauvegarder".
  const existing = await prisma.savedConfig.findFirst({
    where: {
      userId: session.user.id,
      productId: body.productId,
      optionIds: serialized,
    },
  });

  if (existing) {
    return NextResponse.json({ config: existing, duplicate: true });
  }

  const created = await prisma.savedConfig.create({
    data: {
      userId: session.user.id,
      name: body.name.trim(),
      productId: body.productId,
      productName: body.productName.trim(),
      optionIds: serialized,
      summary: body.summary.trim(),
    },
  });

  return NextResponse.json({ config: created, duplicate: false });
});
