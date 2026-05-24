/**
 * GET /api/orders/[id]/calendar.ics
 *
 * Round 27 #3. Génère un .ics RFC 5545 pour la livraison estimée.
 * Customer click "📅 Ajouter au calendrier" → Google/Apple/Outlook
 * importe l'event. UID déterministe → re-import met à jour l'existing
 * au lieu de dupliquer.
 *
 * Auth :
 *   - Owner (session.user.id === order.userId) OU admin
 *   - 404 si pas owner et pas admin (pas leak "cet order existe")
 *
 * État :
 *   - Pas d'ICS si order CANCELLED ou FAILED (rien à mettre au calendrier)
 *   - Si DELIVERED, ICS reste utile comme record historique → on l'inclut
 *     avec STATUS:CONFIRMED + DTSTART = jour de livraison
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { buildOrderIcs } from '@/lib/orders/ics';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      sinaliteOrderId: true,
      productSummary: true,
      createdAt: true,
      events: {
        where: { kind: 'SINALITE_STATUS_CHANGED' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, data: true },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order introuvable' }, { status: 404 });
  }

  // Auth check après lookup : 404 (pas 403) pour pas leak l'existence
  const isOwner = order.userId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Order introuvable' }, { status: 404 });
  }

  // Pas d'ICS pour les orders sans livraison future
  if (order.status === 'CANCELLED' || order.status === 'FAILED') {
    return NextResponse.json({ error: 'Pas d\'ICS pour cette order' }, { status: 410 });
  }

  // Compute ETA date — même règle que computeOrderEta mais on retourne le Date
  const shippedEvent = order.events.find((e) => e.data?.includes('SHIPPED'));
  const base = shippedEvent?.createdAt ?? order.createdAt;
  const daysAhead = shippedEvent ? 3 : 7;
  const etaDate = new Date(base);
  etaDate.setDate(etaDate.getDate() + daysAhead);

  const displayId = order.sinaliteOrderId
    ? `#${order.sinaliteOrderId}`
    : `#${order.id.slice(-6).toUpperCase()}`;

  try {
    const ics = buildOrderIcs({
      orderId: order.id,
      displayId,
      etaDate,
      trackingUrl: `${APP_URL}/orders/${order.id}`,
      productSummary: order.productSummary,
    });

    const filename = `plio-order-${order.id.slice(-8).toUpperCase()}.ics`;

    return new NextResponse(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    log.error({ err, orderId: order.id }, 'ics generation failed');
    return NextResponse.json({ error: 'Erreur génération calendrier' }, { status: 500 });
  }
}
