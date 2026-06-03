/**
 * GET /api/recovery/click?cart=<cartId>&t=<HMAC>&to=<encoded-destination>
 *
 * Round 27 #1. Click tracker pour les emails recovery abandoned-cart.
 * Flow :
 *   1. Email contient RESUME_URL = /api/recovery/click?cart=X&t=TOKEN&to=ENCODED
 *   2. User clique → cette route verify le token + set recoveryClickedAt
 *   3. redirect 302 vers `to` (le vrai /order/review URL)
 *
 * Idempotent : on update seulement si recoveryClickedAt IS NULL (first
 * click) — ré-clicks ne polluent pas le metric "1 click unique par cart".
 *
 * Fail-soft : si token invalide ou cart introuvable, on redirect vers
 * `to` quand même. Pas la peine de bloquer l'user — au pire on n'a pas
 * tracké, mais il continue sa journey.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyRecoveryClickToken } from '@/lib/recovery/click-token';
import { safeInternalPath } from '@/lib/auth/safe-redirect';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cartId = url.searchParams.get('cart');
  const token = url.searchParams.get('t');
  const to = url.searchParams.get('to');

  // Audit v2 #6.1 — anti-open-redirect : l'ancien `decoded.startsWith(APP_URL)`
  // acceptait `https://plio.ca.evil.com/phish` (préfixe sans frontière d'origine)
  // → phishing atteignable sans token. Le `to` est toujours un chemin INTERNE
  // relatif (cf. cron abandoned-cart : `/order/review?...`), donc on réutilise
  // safeInternalPath (helper sécu Round 1, déjà testé : rejette //evil.com,
  // \evil.com, javascript:, origin tierce → fallback). Note : on ne re-décode
  // PAS `to` (searchParams.get l'a déjà décodé une fois) — l'ancien
  // decodeURIComponent supplémentaire pouvait corrompre le `ship=%7B…%7D` encodé.
  const destination = `${APP_URL}${safeInternalPath(to, '/')}`;

  if (!cartId || !token) {
    return NextResponse.redirect(destination, 302);
  }

  if (!verifyRecoveryClickToken(cartId, token)) {
    log.warn({ cartId, ip: req.headers.get('x-forwarded-for') ?? '?' }, 'recovery click: invalid token');
    return NextResponse.redirect(destination, 302);
  }

  // Update only if null = first click. Idempotent re-clicks.
  // Fail-soft : si update throw (cart introuvable, DB hiccup), on
  // redirect quand même pour pas casser le UX de l'user.
  try {
    await prisma.abandonedCart.updateMany({
      where: { id: cartId, recoveryClickedAt: null },
      data: { recoveryClickedAt: new Date() },
    });
  } catch (err) {
    log.warn({ err, cartId }, 'recovery click: track failed (non-fatal)');
  }

  return NextResponse.redirect(destination, 302);
}
