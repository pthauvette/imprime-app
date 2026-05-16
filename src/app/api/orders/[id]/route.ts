import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api-helpers';
import { getOrderById } from '@/lib/db/orders';
import { sinalite } from '@/lib/sinalite/client';
import { SinaliteFile, SinalitePackageInfo } from '@/lib/sinalite/types';
import { auth } from '@/auth';

/**
 * GET /api/orders/[id]
 *
 * Détail d'une commande depuis notre DB. Le param [id] est notre cuid interne
 * (pas l'ID Sinalite). On enrichit avec un fetch Sinalite pour les items
 * (packageInfo/files) si la commande a été SUBMITTED.
 */

const ParamsSchema = z.object({ id: z.string().min(1) });

export const GET = withErrorHandler(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = ParamsSchema.parse(await ctx.params);

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const order = await getOrderById(id);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  // Ownership check : un user ne voit que ses propres orders
  if (order.userId !== session.user.id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Sinalite items (best-effort enrichment) — null si pas encore submitted
  let sinaliteItems: unknown = null;
  if (order.sinaliteOrderId) {
    try {
      const detail = await sinalite.getOrder(Number(order.sinaliteOrderId));
      sinaliteItems = detail.items.map((item) => ({
        ...item,
        options: safeParse<Record<string, string>>(item.options) ?? {},
        optionsRaw: safeParse<string[]>(item.optionsRaw) ?? [],
        packageInfo: safeParse(item.packageInfo, SinalitePackageInfo) ?? null,
        files: safeParse(item.files, z.array(SinaliteFile)) ?? [],
      }));
    } catch (err) {
      console.warn('[orders/:id] Sinalite enrichment failed', err);
    }
  }

  return NextResponse.json({
    order: {
      id: order.id,
      sinaliteOrderId: order.sinaliteOrderId,
      paymentIntentId: order.paymentIntentId,
      status: order.status,
      amountCents: order.amountCents,
      currency: order.currency,
      itemsCount: order.itemsCount,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      taxCents: order.taxCents,
      shippingMethod: order.shippingMethod,
      shipName: order.shipName,
      shipLine1: order.shipLine1,
      shipLine2: order.shipLine2,
      shipCity: order.shipCity,
      shipProvince: order.shipProvince,
      shipPostalCode: order.shipPostalCode,
      shipPhone: order.shipPhone,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      contactEmail: order.user.email,
    },
    events: order.events.map((e) => ({
      kind: e.kind,
      data: e.data ? safeParse(e.data) : null,
      createdAt: e.createdAt.toISOString(),
    })),
    sinaliteItems,
  });
});

function safeParse<T>(jsonString: string, schema?: z.ZodType<T>): T | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (schema) return schema.parse(parsed);
    return parsed as T;
  } catch {
    return null;
  }
}
