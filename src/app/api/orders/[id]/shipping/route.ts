/**
 * PATCH /api/orders/[id]/shipping
 *
 * Round 32. Permet au customer de modifier l'adresse de livraison
 * AVANT que la commande soit soumise à Sinalite (status = PAID
 * uniquement, pas SUBMITTED ni au-delà).
 *
 * Pourquoi : sans ce flow, customer qui réalise qu'il a tapé une
 * mauvaise adresse doit emailer le support (4h ouvrables). Avec
 * une fenêtre PAID → SUBMITTED qui peut durer < 1h via le cron
 * webhook, l'admin n'a pas toujours le temps. Self-service le
 * débloque sans surface admin.
 *
 * Contraintes :
 *   - Province NON modifiable (la tax a été calculée et chargée à
 *     Stripe sur cette base). Changer = devoir refund + re-charge.
 *     Out of scope ici.
 *   - On update aussi sinalitePayload.shipping pour que le webhook
 *     /sinalite/submit utilise la nouvelle adresse, pas l'ancienne.
 *   - OrderEvent "shipping_modified" persisté pour audit.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  shipName: z.string().min(2).max(120),
  shipLine1: z.string().min(3).max(200),
  shipLine2: z.string().max(200).optional().nullable(),
  shipCity: z.string().min(2).max(80),
  // shipProvince intentionally NOT in schema — change requires refund/recharge
  shipPostalCode: z
    .string()
    .regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/i, 'Code postal canadien invalide')
    .transform((s) => s.toUpperCase().replace(/[\s-]/g, '').replace(/^(.{3})(.{3})$/, '$1 $2')),
  shipPhone: z.string().min(7).max(20),
});

// Audit v2 #10.8 — enveloppé dans withErrorHandler : une exception inattendue
// (ex. blip DB dans le $transaction) renvoie désormais une 500 générique cohérente
// (sans fuite de stack) au lieu d'une erreur Next.js brute non gérée.
export const PATCH = withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Payload invalide', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Ownership + status check en 1 query
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      shipName: true,
      shipLine1: true,
      shipLine2: true,
      shipCity: true,
      shipPostalCode: true,
      shipPhone: true,
      sinalitePayload: true,
    },
  });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.userId !== session.user.id) {
    // Pas de fuite : on simule 404 plutôt que 403
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (order.status !== 'PAID') {
    return NextResponse.json(
      {
        error:
          order.status === 'PENDING'
            ? 'La commande n\'est pas encore confirmée. Réessaie dans 1 minute.'
            : 'Trop tard — la commande a déjà été soumise à l\'imprimeur. Contacte-nous par email.',
        code: 'STATUS_LOCKED',
        currentStatus: order.status,
      },
      { status: 409 },
    );
  }

  // Update sinalitePayload aussi pour que le webhook /sinalite/submit
  // utilise la nouvelle adresse. Le payload est stocké en String JSON.
  let updatedPayload = order.sinalitePayload;
  try {
    const parsedPayload = JSON.parse(order.sinalitePayload) as Record<string, unknown>;
    const shipping = (parsedPayload.shipping ?? {}) as Record<string, unknown>;
    parsedPayload.shipping = {
      ...shipping,
      name: data.shipName,
      address: data.shipLine1,
      address2: data.shipLine2 ?? '',
      city: data.shipCity,
      postalCode: data.shipPostalCode,
      phone: data.shipPhone,
    };
    updatedPayload = JSON.stringify(parsedPayload);
  } catch (err) {
    log.warn({ err, orderId: id }, 'shipping update: sinalitePayload not JSON-parseable, leaving as-is');
    // Defensive : si le payload est corrompu, on update quand même les
    // colonnes Order (qui sont source de vérité pour le ship label).
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id },
      data: {
        shipName: data.shipName,
        shipLine1: data.shipLine1,
        shipLine2: data.shipLine2 ?? null,
        shipCity: data.shipCity,
        shipPostalCode: data.shipPostalCode,
        shipPhone: data.shipPhone,
        sinalitePayload: updatedPayload,
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: id,
        kind: 'SHIPPING_MODIFIED',
        data: JSON.stringify({
          actor: 'customer',
          before: {
            name: order.shipName,
            line1: order.shipLine1,
            line2: order.shipLine2,
            city: order.shipCity,
            postal: order.shipPostalCode,
            phone: order.shipPhone,
          },
          after: {
            name: data.shipName,
            line1: data.shipLine1,
            line2: data.shipLine2,
            city: data.shipCity,
            postal: data.shipPostalCode,
            phone: data.shipPhone,
          },
        }),
      },
    }),
  ]);

  log.info({ orderId: id, userId: session.user.id }, 'order shipping modified by customer');

  return NextResponse.json({ ok: true });
});
