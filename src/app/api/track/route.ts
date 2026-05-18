/**
 * POST /api/track
 *
 * Lookup public d'une commande par (orderNumber + email). Pas d'auth requise
 * — le pair (numéro de commande + email du payeur) sert de "preuve" légère
 * de propriété. Utilisé par /track pour permettre au customer de voir le
 * statut sans devoir se connecter (magic link friction → support ticket).
 *
 * Anti-abuse :
 *   - Rate-limit `signin` (5 req/15min/IP) — strict car même menace
 *     que signin (enumeration d'emails / orders existants).
 *   - On retourne un 404 générique si pas de match, pour pas leak
 *     "tel order existe mais l'email est wrong".
 *   - L'IP du requester est loggée (via clientIp) — pas dans la réponse,
 *     juste dans les logs server pour détection d'abus.
 *
 * Réponse 200 : objet trim contenant juste ce qui est nécessaire pour
 * afficher la timeline + l'ETA + le tracking number (pas de PII addresse,
 * pas de prix, pas de items détaillés — `/orders/[id]` reste l'endroit
 * autoritaire pour le détail complet).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { log } from '@/lib/logger';
import {
  buildOrderTimeline,
  computeOrderEta,
  extractTracking,
} from '@/lib/orders/timeline';
import type { OrderStatus } from '@/lib/db/orders';

const BodySchema = z.object({
  // Numéro de commande tel que présenté au customer : soit le sinaliteOrderId
  // (préféré), soit les 6 derniers chars de l'order.id en uppercase (fallback
  // pour orders qui n'ont pas encore été submitted à Sinalite).
  orderNumber: z.string().trim().min(3).max(80),
  email: z.string().trim().email().max(150),
});

export const POST = withErrorHandler(async (req: Request) => {
  const limit = await rateLimit('signin', clientIp(req));
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);
  const number = body.orderNumber.trim().toUpperCase().replace(/^#/, '');
  const email = body.email.toLowerCase().trim();

  // 2 stratégies de lookup :
  //   1. Match exact sur sinaliteOrderId (case-insensitive)
  //   2. Fallback : suffix sur order.id (les derniers 6 chars uppercase)
  // Within each strategy, on filtre aussi par email pour ownership proof.
  const order = await prisma.order.findFirst({
    where: {
      AND: [
        { user: { email } },
        {
          OR: [
            { sinaliteOrderId: number },
            { sinaliteOrderId: body.orderNumber.trim() },
            // Pour les orders sans sinaliteOrderId : fallback sur id endsWith.
            // Note : Prisma SQLite ne supporte pas endsWith insensitive sur
            // String, mais le filter via la query app-side après fetch fait
            // l'affaire (small N).
          ],
        },
      ],
    },
    include: {
      events: { orderBy: { createdAt: 'asc' } },
      user: { select: { email: true, firstName: true } },
    },
  });

  // Fallback : si pas trouvé par sinaliteOrderId, scan par id suffix.
  let found = order;
  if (!found && number.length >= 6) {
    const candidates = await prisma.order.findMany({
      where: { user: { email } },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        user: { select: { email: true, firstName: true } },
      },
    });
    found = candidates.find((o) => o.id.toUpperCase().endsWith(number)) ?? null;
  }

  if (!found) {
    log.info(
      { ip: clientIp(req), email, orderNumber: number },
      'public track lookup: no match',
    );
    return NextResponse.json(
      {
        error:
          'Aucune commande trouvée pour ce numéro et cet email. Vérifie le numéro tel que reçu par courriel — il commence souvent par "SIN-".',
      },
      { status: 404 },
    );
  }

  const status = found.status as OrderStatus;
  const timeline = buildOrderTimeline(found, status);
  const tracking = extractTracking(found.events);
  const shippedEvent = [...found.events]
    .reverse()
    .find((e) => e.kind === 'SINALITE_STATUS_CHANGED' && e.data?.includes('SHIPPED'));
  const eta = computeOrderEta(found, shippedEvent?.createdAt);
  const displayNumber = found.sinaliteOrderId
    ? `#${found.sinaliteOrderId}`
    : `#${found.id.slice(-6).toUpperCase()}`;

  return NextResponse.json({
    ok: true,
    order: {
      displayNumber,
      status,
      placedAt: found.createdAt.toISOString(),
      firstName: found.user.firstName ?? null,
      timeline,
      tracking,
      eta,
    },
  });
});
