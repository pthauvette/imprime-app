import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api-helpers';
import { listOrdersForUser, ORDER_STATUS } from '@/lib/db/orders';
import { auth } from '@/auth';

/**
 * GET /api/orders?limit=50&status=PAID
 *
 * Liste les commandes depuis notre DB (snapshot par order créé au webhook
 * Stripe). Le shape diffère de l'ancien (qui hit Sinalite directement) :
 *   - status: PENDING|PAID|SUBMITTED|IN_PRODUCTION|SHIPPED|DELIVERED|CANCELLED|FAILED
 *   - amounts en cents (Int) au lieu de dollars
 */

const QuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('50'),
  status: z.enum(ORDER_STATUS).optional(),
});

export const GET = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const { limit, status } = QuerySchema.parse({
    limit: url.searchParams.get('limit') ?? '50',
    status: url.searchParams.get('status') ?? undefined,
  });

  const all = await listOrdersForUser({ userId: session.user.id, limit });
  const orders = status ? all.filter((o) => o.status === status) : all;

  return NextResponse.json({
    count: orders.length,
    orders: orders.map((o) => ({
      id: o.id,
      sinaliteOrderId: o.sinaliteOrderId,
      status: o.status,
      paymentIntentId: o.paymentIntentId,
      amountCents: o.amountCents,
      currency: o.currency,
      itemsCount: o.itemsCount,
      subtotalCents: o.subtotalCents,
      shippingCents: o.shippingCents,
      taxCents: o.taxCents,
      shippingMethod: o.shippingMethod,
      shipName: o.shipName,
      shipCity: o.shipCity,
      shipProvince: o.shipProvince,
      createdAt: o.createdAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
      contactEmail: o.user.email,
    })),
  });
});
