/**
 * PATCH /api/admin/orders/[id]/notes
 *
 * Update les notes internes admin sur une commande. Pas append-only —
 * l'admin peut éditer librement (les anciennes versions ne sont pas
 * archivées par défaut, mais chaque update logue un AdminAuditEvent avec
 * un snapshot du contenu précédent et nouveau pour traçabilité).
 *
 * Body : { notes: string | null }
 * - null/empty string → clear les notes (NULL en DB)
 * - sinon → set le texte (max 5000 chars)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

const BodySchema = z.object({
  notes: z.string().max(5000).nullable(),
});

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await parseBody(req, BodySchema);

  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, adminNotes: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  }

  // Normalise empty/whitespace-only strings to null pour garder la colonne propre
  const normalized = body.notes && body.notes.trim().length > 0 ? body.notes.trim() : null;

  // No-op early return si rien n'a changé — évite audit log inutile
  if (normalized === existing.adminNotes) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.order.update({
    where: { id },
    data: { adminNotes: normalized },
  });

  await recordAdminAudit({
    kind: 'ADMIN_ORDER_NOTES_EDIT', // §8.6 — kind dédié (était ADMIN_TEMPLATE_EDIT)
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'ORDER',
    targetId: id,
    data: {
      action: 'ADMIN_NOTES_EDIT',
      previousLength: existing.adminNotes?.length ?? 0,
      newLength: normalized?.length ?? 0,
      previousSnippet: existing.adminNotes?.slice(0, 200) ?? null,
      newSnippet: normalized?.slice(0, 200) ?? null,
    },
  });

  return NextResponse.json({ ok: true, notes: normalized });
});
