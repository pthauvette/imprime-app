/**
 * GET /api/addresses — carnet du user connecté (SHIPPING par défaut).
 * POST /api/addresses
 *
 * Crée une adresse SHIPPING ou BILLING dans le carnet du user.
 * Si isDefault=true, on unset le default des autres adresses du même kind
 * (transactionnel — un seul default par kind à la fois).
 *
 * Auth requise — le user lit/crée pour lui-même uniquement (pas d'admin override).
 *
 * Round expérience-client [34]/[53]/[126] — avant ce GET, /order/shipping ne
 * lisait QUE le localStorage : un client fidèle retapait 8 champs à chaque
 * commande alors que le carnet (/addresses) existait déjà côté écriture.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'] as const;

export const GET = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }
  const kindParam = new URL(req.url).searchParams.get('kind');
  const kind = kindParam === 'BILLING' ? 'BILLING' : 'SHIPPING';

  const addresses = await prisma.address.findMany({
    where: { userId: session.user.id, kind },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });

  return NextResponse.json({ addresses });
});

const BodySchema = z.object({
  kind: z.enum(['SHIPPING', 'BILLING']),
  label: z.string().max(60).optional(),
  isDefault: z.boolean().optional(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  company: z.string().max(120).optional(),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  province: z.enum(PROVINCES),
  postalCode: z.string().regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, 'Format A1A 1A1 attendu'),
  phone: z.string().max(30).optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await parseBody(req, BodySchema);

  const postalNormalized = body.postalCode.toUpperCase().replace(/\s/g, '');

  const result = await prisma.$transaction(async (tx) => {
    if (body.isDefault) {
      await tx.address.updateMany({
        where: { userId, kind: body.kind, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.address.create({
      data: {
        userId,
        kind: body.kind,
        label: body.label?.trim() ?? null,
        isDefault: body.isDefault ?? false,
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        company: body.company?.trim() ?? null,
        line1: body.line1.trim(),
        line2: body.line2?.trim() ?? null,
        city: body.city.trim(),
        province: body.province,
        postalCode: postalNormalized,
        phone: body.phone?.trim() ?? null,
      },
    });
  });

  return NextResponse.json({ ok: true, address: result });
});
