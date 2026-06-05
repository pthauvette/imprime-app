/**
 * PATCH /api/admin/promo-codes/[id]
 *
 * Update partiel d'un PromoCode. Le code lui-même est immutable (pour pas
 * casser les Order existantes qui le référencent). On peut toggle `active`,
 * changer `label`, `expiresAt`, `maxUses`, `minSubtotalCents`,
 * `firstOrderOnly`. Le discount est immutable aussi : si tu veux changer,
 * crée un nouveau code.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const PatchPromoSchema = z.object({
  active: z.boolean().optional(),
  label: z.string().max(200).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  minSubtotalCents: z.number().int().nonnegative().nullable().optional(),
  firstOrderOnly: z.boolean().optional(),
});

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, PatchPromoSchema);

  const existing = await prisma.promoCode.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Code introuvable' }, { status: 404 });
  }

  // Préparer le data — on ne peut pas spread `body` direct parce que les
  // valeurs explicit null doivent passer pour clear les colonnes.
  const data: Record<string, unknown> = {};
  if ('active' in body) data.active = body.active;
  if ('label' in body) data.label = body.label;
  if ('expiresAt' in body) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if ('maxUses' in body) data.maxUses = body.maxUses;
  if ('minSubtotalCents' in body) data.minSubtotalCents = body.minSubtotalCents;
  if ('firstOrderOnly' in body) data.firstOrderOnly = body.firstOrderOnly;

  const updated = await prisma.promoCode.update({ where: { id }, data });

  // Audit : ADMIN_PROMO_TOGGLE si c'est juste un on/off, sinon ADMIN_PROMO_UPDATE
  const isJustToggle = Object.keys(body).length === 1 && 'active' in body;
  await recordAdminAudit({
    kind: isJustToggle ? 'ADMIN_PROMO_TOGGLE' : 'ADMIN_PROMO_UPDATE',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'PROMO_CODE',
    targetId: id,
    data: { code: existing.code, changes: body },
  });

  return NextResponse.json({ promo: updated });
});
