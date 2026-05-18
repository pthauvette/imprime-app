/**
 * GET /api/cron/abandoned-cart
 *
 * Cron hourly. Cherche les AbandonedCart qui :
 *   - ont updatedAt entre 24h et 72h (window — pas trop tôt, pas trop tard)
 *   - emailSentAt is null (pas déjà envoyé)
 *   - AUCUNE Order n'existe pour cet email depuis updatedAt (= user a fini
 *     entre-temps via un autre chemin, ne pas spammer)
 *   - lastStep != 'review' (review = 95 % conversion, on n'embête pas)
 *
 * Envoie le recovery email + set emailSentAt pour dédup.
 *
 * Limit 100 carts par run. Au-delà → recovery rate vraiment haut, on
 * a bigger problem qui mérite investigation pas un cron.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { sendAbandonedCartEmail } from '@/lib/emails/send';
import { sinalite } from '@/lib/sinalite/client';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';
const BATCH = 100;

export async function GET(req: NextRequest) {
  // Auth
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      log.error('cron/abandoned-cart: CRON_SECRET not set in production');
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    log.warn('cron/abandoned-cart: CRON_SECRET not set — allowing in non-prod');
  } else {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const start = Date.now();
  const cutoffOld = new Date(Date.now() - 24 * 3600 * 1000);
  const cutoffTooOld = new Date(Date.now() - 72 * 3600 * 1000);

  let sent = 0;
  let skippedConverted = 0;
  let skippedReview = 0;
  let failed = 0;

  try {
    const candidates = await prisma.abandonedCart.findMany({
      where: {
        emailSentAt: null,
        updatedAt: { lte: cutoffOld, gte: cutoffTooOld },
      },
      orderBy: { updatedAt: 'asc' },
      take: BATCH,
    });

    for (const cart of candidates) {
      // Skip si lastStep=review (95 % conversion)
      if (cart.lastStep === 'review') {
        skippedReview++;
        continue;
      }
      // Skip si une Order existe pour cet email après updatedAt = user a
      // fini autrement.
      const subsequentOrder = await prisma.order.findFirst({
        where: {
          user: { email: cart.email },
          createdAt: { gte: cart.updatedAt },
        },
        select: { id: true },
      });
      if (subsequentOrder) {
        skippedConverted++;
        // Marque emailSentAt quand même pour ne plus re-checker
        await prisma.abandonedCart.update({
          where: { id: cart.id },
          data: { emailSentAt: new Date() },
        });
        continue;
      }

      // Fetch product name pour le subject + body
      let productName = 'Plio';
      try {
        const product = await sinalite.getProduct(cart.productId);
        productName = product.name ?? productName;
      } catch {
        // Sinalite down ou produit invalide → fallback string
      }

      // Build resume URL → /order/review?productId=X&...resumeQuery
      const resumeUrl = `${APP_URL}/order/review?productId=${cart.productId}&${cart.resumeQuery}`;

      // FirstName best-effort : look up User par email si existe
      let firstName = cart.email.split('@')[0];
      try {
        const user = await prisma.user.findUnique({
          where: { email: cart.email },
          select: { firstName: true, name: true },
        });
        if (user?.firstName) firstName = user.firstName;
        else if (user?.name) firstName = user.name.split(' ')[0];
      } catch {
        // ignore
      }

      try {
        const result = await sendAbandonedCartEmail({
          to: cart.email,
          firstName,
          productName,
          resumeUrl,
          cartId: cart.id,
        });
        if (result.sent) {
          sent++;
          await prisma.abandonedCart.update({
            where: { id: cart.id },
            data: { emailSentAt: new Date() },
          });
        } else {
          failed++;
        }
      } catch (err) {
        log.error({ err, cartId: cart.id }, 'abandoned-cart email send failed');
        failed++;
      }
    }

    const result = {
      ok: true,
      latencyMs: Date.now() - start,
      eligible: candidates.length,
      sent,
      skippedConverted,
      skippedReview,
      failed,
    };
    log.info(result, 'cron/abandoned-cart ran');
    void pingCronHealthcheck('abandoned-cart', 'success', { sent });
    void recordCronRun({
      name: 'abandoned-cart',
      status: 'success',
      latencyMs: Date.now() - start,
      data: { eligible: candidates.length, sent, skippedConverted, skippedReview, failed },
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, 'cron/abandoned-cart failed');
    const errMsg = err instanceof Error ? err.message : 'unknown';
    void pingCronHealthcheck('abandoned-cart', 'fail', { error: errMsg });
    void recordCronRun({
      name: 'abandoned-cart',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
    });
    return NextResponse.json(
      { ok: false, error: errMsg, latencyMs: Date.now() - start },
      { status: 500 },
    );
  }
}
