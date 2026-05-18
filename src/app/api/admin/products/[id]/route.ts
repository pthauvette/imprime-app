/**
 * /api/admin/products/[id] — gestion d'un override admin sur un produit
 * Sinalite (table ProductOverride).
 *
 *  - PUT   : upsert l'override (disabled / featured / displayName /
 *            displayDescription / marginPct / notes). Body partiel : seuls
 *            les champs présents sont mis à jour.
 *  - DELETE: supprime complètement l'override → produit revient au state
 *            Sinalite natif.
 *
 * Tout est audité dans AdminAuditEvent (kind = ADMIN_PRODUCT_OVERRIDE_*).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const UpsertSchema = z.object({
  disabled: z.boolean().optional(),
  featured: z.boolean().optional(),
  displayName: z.string().max(200).nullable().optional(),
  displayDescription: z.string().max(2000).nullable().optional(),
  marginPct: z.number().int().min(-50).max(500).nullable().optional(),
  /** Array d'option IDs à cacher du wizard customer. Stocké en JSON string. */
  hiddenOptionIds: z.array(z.number().int().positive()).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export const PUT = withErrorHandler(async (req: Request, ctx: RouteCtx) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const productId = Number(id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json({ error: 'productId invalide' }, { status: 400 });
  }

  const body = await parseBody(req, UpsertSchema);

  // hiddenOptionIds : array → JSON string (NULL = pas d'override sur ce champ).
  // null explicite signifie "clear" → on stocke NULL pour reset.
  const hiddenOptionIdsSerialized = body.hiddenOptionIds === undefined
    ? undefined
    : body.hiddenOptionIds === null
      ? null
      : JSON.stringify(body.hiddenOptionIds);

  // Upsert : si l'override n'existe pas on le crée avec defaults + patch,
  // sinon on met à jour seulement les champs présents dans body.
  const override = await prisma.productOverride.upsert({
    where: { sinaliteProductId: productId },
    create: {
      sinaliteProductId: productId,
      disabled: body.disabled ?? false,
      featured: body.featured ?? false,
      displayName: body.displayName ?? null,
      displayDescription: body.displayDescription ?? null,
      marginPct: body.marginPct ?? null,
      hiddenOptionIds: hiddenOptionIdsSerialized ?? null,
      notes: body.notes ?? null,
    },
    update: {
      ...(body.disabled !== undefined && { disabled: body.disabled }),
      ...(body.featured !== undefined && { featured: body.featured }),
      ...(body.displayName !== undefined && { displayName: body.displayName }),
      ...(body.displayDescription !== undefined && { displayDescription: body.displayDescription }),
      ...(body.marginPct !== undefined && { marginPct: body.marginPct }),
      ...(hiddenOptionIdsSerialized !== undefined && { hiddenOptionIds: hiddenOptionIdsSerialized }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
  });

  await recordAdminAudit({
    kind: 'ADMIN_PRODUCT_OVERRIDE_UPSERT',
    adminId: guard.user.id,
    adminEmail: guard.user.email,
    targetType: 'PRODUCT',
    targetId: String(productId),
    data: body as Record<string, unknown>,
  });

  return NextResponse.json({ override });
});

export const DELETE = withErrorHandler(async (_req: Request, ctx: RouteCtx) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const productId = Number(id);
  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json({ error: 'productId invalide' }, { status: 400 });
  }

  await prisma.productOverride.deleteMany({
    where: { sinaliteProductId: productId },
  });

  await recordAdminAudit({
    kind: 'ADMIN_PRODUCT_OVERRIDE_DELETE',
    adminId: guard.user.id,
    adminEmail: guard.user.email,
    targetType: 'PRODUCT',
    targetId: String(productId),
  });

  return NextResponse.json({ ok: true });
});
