/**
 * POST /api/newsletter/subscribe
 *
 * Capture lead newsletter avec consentement EXPRESS CASL.
 *
 * Body : { email, source? }
 *
 * Stratégie sécurité :
 *   - Rate-limited bucket 'signin' (5 req/15min/IP) — anti spam/abuse
 *   - Email validated par Zod
 *   - Dedup : si email déjà ACTIVE, return 200 sans erreur (idempotent)
 *   - Si email UNSUBSCRIBED précédemment, on re-active (l'user a explicitement
 *     opt-in à nouveau, considered consent renewal)
 *   - Stocke IP + User-Agent comme preuve de consentement (CASL art. 10
 *     burden of proof on sender)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { log } from '@/lib/logger';

const BodySchema = z.object({
  email: z.string().email().max(150),
  source: z.string().max(50).optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  // Rate-limit serré — endpoint public vulnérable au spam
  const limit = await rateLimit('signin', clientIp(req));
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);
  const email = body.email.trim().toLowerCase();
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent')?.slice(0, 500) ?? null;

  // Upsert : si déjà ACTIVE → idempotent, si UNSUBSCRIBED → reactive
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });

  if (existing?.status === 'ACTIVE') {
    // Idempotent OK
    return NextResponse.json({ ok: true, alreadySubscribed: true });
  }

  if (existing) {
    // Reactivate (était UNSUBSCRIBED ou BOUNCED)
    await prisma.newsletterSubscriber.update({
      where: { email },
      data: {
        status: 'ACTIVE',
        source: body.source ?? existing.source,
        consentIp: ip,
        consentUa: ua,
        subscribedAt: new Date(),
        unsubscribedAt: null,
      },
    });
    log.info({ email, source: body.source, reactivated: true }, 'newsletter resubscribed');
  } else {
    await prisma.newsletterSubscriber.create({
      data: {
        email,
        source: body.source ?? 'unknown',
        consentIp: ip,
        consentUa: ua,
        status: 'ACTIVE',
      },
    });
    log.info({ email, source: body.source }, 'newsletter subscribed');
  }

  return NextResponse.json({ ok: true });
});
