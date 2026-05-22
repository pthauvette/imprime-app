/**
 * GET / POST /api/admin/saved-filters
 *
 * Round 26 #5. CRUD léger pour les filtres bookmarkés admin.
 *
 *   GET ?scope=orders → list des filtres du current admin pour ce scope
 *   POST { scope, name, queryString } → create
 *
 * Per-admin via session.user.id. Pas de partage entre admins.
 * scope est validé contre une whitelist pour éviter le wildcard.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';

const SCOPES = ['orders', 'users', 'webhooks', 'reviews', 'emails', 'experiments'] as const;
const ScopeSchema = z.enum(SCOPES);

const CreateSchema = z.object({
  scope: ScopeSchema,
  name: z.string().trim().min(1).max(60),
  /** Query string sans le leading ?, max 500 chars (safety cap contre URL abusive). */
  queryString: z.string().trim().max(500),
});

export const GET = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const scopeParam = url.searchParams.get('scope');
  const parsed = ScopeSchema.safeParse(scopeParam);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid scope', validScopes: SCOPES }, { status: 400 });
  }

  const filters = await prisma.adminSavedFilter.findMany({
    where: { userId: guard.userId, scope: parsed.data },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, queryString: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, filters });
});

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, CreateSchema);

  const created = await prisma.adminSavedFilter.create({
    data: {
      userId: guard.userId,
      scope: body.scope,
      name: body.name,
      queryString: body.queryString,
    },
    select: { id: true, name: true, queryString: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, filter: created });
});
