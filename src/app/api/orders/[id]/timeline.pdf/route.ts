/**
 * GET /api/orders/[id]/timeline.pdf
 *
 * Round 19 #5 — génère un PDF historique pour une commande customer.
 * Ownership check : seul le user de la commande peut télécharger (ou admin).
 *
 * Different de /api/orders/[id]/invoice.pdf (qui est le reçu fiscal officiel).
 * Ici : view customer-friendly de timeline + statut + montants.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { visiblePourClient } from '@/lib/orders/event-visibility';
import { generateTimelinePdf } from '@/lib/print/timeline-pdf';
import { logEmail as log } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, firstName: true, lastName: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order introuvable' }, { status: 404 });
  }

  // Ownership : user owner OR admin. 403 (pas 404) si ownership fail —
  // l'user sait que l'order existe mais a pas accès → message clair.
  const isOwner = order.userId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  // ⚠️ MÊME FILTRE QUE LA TIMELINE WEB, ET IL MANQUAIT ICI.
  // Cette route rendait TOUS les événements, sans notion de `kind` : la
  // timeline web était étanche (`showErrors={isAdmin}`) et ce PDF ne l'était
  // pas. `SINALITE_SUBMIT_UNCERTAIN`, livré et déployé, s'y imprimait en
  // littéral brut faute de libellé — régression [49] rejouée, parce que la
  // liste des internes vivait en dur dans un composant.
  const evenements = isAdmin
    ? order.events
    : order.events.filter((e) => visiblePourClient(e.kind));

  try {
    const customerName = order.user.name
      ?? [order.user.firstName, order.user.lastName].filter(Boolean).join(' ').trim()
      ?? null;
    const pdfBytes = await generateTimelinePdf({
      order,
      events: evenements,
      customer: { name: customerName, email: order.user.email },
    });

    const displayId = order.sinaliteOrderId ?? order.id.slice(-8).toUpperCase();
    const filename = `plio-historique-${displayId}.pdf`;

    // Cast en BodyInit — Uint8Array est valide runtime mais TS strict
    // veut un ArrayBuffer-like. Pattern utilisé aussi dans invoice.pdf route.
    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    log.error({ err, orderId: id }, 'timeline pdf generation failed');
    return NextResponse.json({ error: 'Génération PDF échouée' }, { status: 500 });
  }
}
