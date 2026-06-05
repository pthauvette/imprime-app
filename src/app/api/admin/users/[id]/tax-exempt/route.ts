/**
 * POST /api/admin/users/[id]/tax-exempt
 *
 * Toggle le statut tax-exempt d'un user. Body :
 *   { taxExempt: boolean, taxExemptCertId?: string }
 *
 * Si taxExempt=true, taxExemptCertId est requis (numéro certificat à
 * archiver pour audit Revenu Québec / ARC). Si taxExempt=false, le
 * certId est nullifié.
 *
 * Audit log mandatory : ADMIN_TAX_EXEMPT_TOGGLE avec previous/new values
 * + adminEmail (chaîne de responsabilité pour audits fiscaux).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.object({
  taxExempt: z.boolean(),
  taxExemptCertId: z.string().trim().min(3).max(100).optional(),
});

export const POST = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id: userId } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  // Si on flip à true, certId obligatoire — sinon refus
  if (body.taxExempt && !body.taxExemptCertId) {
    return NextResponse.json(
      { error: 'Certificate ID requis pour activer le statut tax-exempt (audit fiscal)' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, taxExempt: true, taxExemptCertId: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User introuvable' }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      taxExempt: body.taxExempt,
      // Nullify cert quand on désactive (cleanup explicite, pas de stale data)
      taxExemptCertId: body.taxExempt ? (body.taxExemptCertId ?? null) : null,
    },
  });

  await recordAdminAudit({
    kind: 'ADMIN_TAX_EXEMPT_TOGGLE',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: userId,
    data: {
      userEmail: user.email,
      previousTaxExempt: user.taxExempt,
      newTaxExempt: body.taxExempt,
      previousCertId: user.taxExemptCertId,
      newCertId: updated.taxExemptCertId,
    },
  });

  return NextResponse.json({ ok: true, user: { id: updated.id, taxExempt: updated.taxExempt, taxExemptCertId: updated.taxExemptCertId } });
});
