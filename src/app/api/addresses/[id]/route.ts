/**
 * PATCH /api/addresses/[id]
 * DELETE /api/addresses/[id]
 *
 * Update ou supprime une adresse. Ownership check : le user ne peut
 * toucher que ses propres adresses (404 silencieux sinon).
 *
 * Actions PATCH supportées :
 *   - update      : tous les fields modifiables (label, line1, etc.)
 *   - set-default : marque comme default + unset les autres du même kind
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'] as const;

const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    label: z.string().max(60).nullable().optional(),
    firstName: z.string().min(1).max(80).optional(),
    lastName: z.string().min(1).max(80).optional(),
    company: z.string().max(120).nullable().optional(),
    line1: z.string().min(1).max(200).optional(),
    line2: z.string().max(200).nullable().optional(),
    city: z.string().min(1).max(100).optional(),
    province: z.enum(PROVINCES).optional(),
    postalCode: z.string().regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/).optional(),
    phone: z.string().max(30).nullable().optional(),
  }),
  z.object({ action: z.literal('set-default') }),
]);

export const PATCH = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await ctx.params;

  const existing = await prisma.address.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Address introuvable' }, { status: 404 });
  }

  const body = await parseBody(req, PatchSchema);

  if (body.action === 'set-default') {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId, kind: existing.kind, isDefault: true },
        data: { isDefault: false },
      });
      return tx.address.update({
        where: { id },
        data: { isDefault: true },
      });
    });
    return NextResponse.json({ ok: true, address: updated });
  }

  // 'update'
  const { action: _action, postalCode, ...rest } = body;
  void _action;
  const data: Record<string, unknown> = { ...rest };
  if (postalCode) {
    data.postalCode = postalCode.toUpperCase().replace(/\s/g, '');
  }
  const updated = await prisma.address.update({
    where: { id },
    data,
  });
  return NextResponse.json({ ok: true, address: updated });
});

export const DELETE = withErrorHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await ctx.params;

  const existing = await prisma.address.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Address introuvable' }, { status: 404 });
  }

  await prisma.address.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
