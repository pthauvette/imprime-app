/**
 * /api/admin/promo-codes
 *   - GET  : liste tous les codes (newest first)
 *   - POST : créer un nouveau code
 *
 * Body POST :
 *   {
 *     code, label?, discountPct?, discountCents?, expiresAt?, maxUses?,
 *     minSubtotalCents?, firstOrderOnly?
 *   }
 *
 * Validation : exactement un de discountPct (1-100) OU discountCents (>0).
 * Code normalisé en upper. Unique constraint sur DB → conflit 409 si déjà
 * pris.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { normalizeCode } from '@/lib/promo/validate';

const CreatePromoSchema = z.object({
  code: z.string().min(1).max(64),
  label: z.string().max(200).optional(),
  discountPct: z.number().int().min(1).max(100).optional(),
  discountCents: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
  minSubtotalCents: z.number().int().nonnegative().optional(),
  firstOrderOnly: z.boolean().optional(),
}).refine(
  (d) => (d.discountPct !== undefined) !== (d.discountCents !== undefined),
  { message: 'Exactement un de discountPct ou discountCents' },
);

export const GET = withErrorHandler(async () => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const codes = await prisma.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      _count: { select: { orders: true } },
    },
  });

  return NextResponse.json({ codes });
});

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, CreatePromoSchema);
  const code = normalizeCode(body.code);

  // Pre-check unique pour donner une erreur claire (sinon Prisma throw P2002)
  const existing = await prisma.promoCode.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json(
      { error: `Le code "${code}" existe déjà.`, code: 'DUPLICATE' },
      { status: 409 },
    );
  }

  const created = await prisma.promoCode.create({
    data: {
      code,
      label: body.label,
      discountPct: body.discountPct,
      discountCents: body.discountCents,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      maxUses: body.maxUses,
      minSubtotalCents: body.minSubtotalCents,
      firstOrderOnly: body.firstOrderOnly ?? false,
    },
  });

  // Audit log : trace qui a créé le code (utile si abus / fraude interne).
  void recordAdminAudit({
    kind: 'ADMIN_PROMO_CREATE',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'PROMO_CODE',
    targetId: created.id,
    data: { code, discountPct: body.discountPct, discountCents: body.discountCents },
  });

  return NextResponse.json({ promo: created }, { status: 201 });
});
