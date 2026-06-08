import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody, assertSameOrigin } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/ratelimit';
import { generateApiKey, parseScopes, API_KEY_SCOPES } from '@/lib/mcp/auth';

/**
 * POST /api/account/api-keys — crée une clé API pour l'user connecté.
 *
 * Le token en clair n'est retourné QU'ICI, une seule fois (jamais relisible
 * ensuite : la DB ne stocke que le hash). Self-serve, gardé par la session de
 * l'user (pas admin — chacun gère SES clés). Rate-limité par user + cap dur du
 * nombre de clés actives.
 */
const MAX_ACTIVE_KEYS = 20;

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(API_KEY_SCOPES)).max(API_KEY_SCOPES.length).default([]),
});

export const POST = withErrorHandler(async (req: Request) => {
  const csrf = assertSameOrigin(req); // défense en profondeur (route credential)
  if (csrf) return csrf;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const userId = session.user.id;

  // Anti-abus : borne la création par user (session compromise ne mint pas en masse).
  const limit = await rateLimit('apiKeyMint', `user:${userId}`);
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, CreateSchema);
  // Re-normalise via la source unique (trim+lowercase+whitelist) — défense en profondeur.
  const scopes = parseScopes((body.scopes ?? []).join(','));

  const active = await prisma.apiKey.count({ where: { userId, revokedAt: null } });
  if (active >= MAX_ACTIVE_KEYS) {
    return NextResponse.json(
      { error: `Limite de ${MAX_ACTIVE_KEYS} clés actives atteinte. Révoque-en une avant d'en créer une nouvelle.` },
      { status: 409 },
    );
  }

  const { token, keyHash, keyPrefix } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: { userId, name: body.name, keyHash, keyPrefix, scopes: scopes.join(',') },
    select: { id: true, name: true, keyPrefix: true, scopes: true, createdAt: true },
  });

  // ⚠️ `token` (clair) UNIQUEMENT ici — jamais re-render, jamais reloggé.
  return NextResponse.json({ key, token }, { status: 201 });
});
