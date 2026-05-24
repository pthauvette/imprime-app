/**
 * HMAC token pour les click trackers des emails recovery.
 *
 * Round 27 #1. Même pattern que paymentRetryToken (Round 25 #5) et
 * reviewSubmitToken (Round 13) : déterministe par cartId, signé avec
 * AUTH_SECRET, pas d'expiration explicite.
 *
 * Pourquoi un token vs juste ?cart=ID :
 *   - Sans token, un attaquant peut enumerate ?cart=1, ?cart=2…
 *     pour polluer les stats click (et déclencher des recoveryClickedAt
 *     sur des carts qui n'ont jamais été emailé).
 *   - HMAC = constant-time verify, no DB lookup, no expiry table.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function recoveryClickToken(cartId: string): string {
  const secret = process.env.AUTH_SECRET ?? 'dev-secret';
  return createHmac('sha256', secret)
    .update(`abandoned-cart-click:${cartId}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyRecoveryClickToken(cartId: string, token: string): boolean {
  const expected = recoveryClickToken(cartId);
  if (expected.length !== token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(token, 'utf8'));
  } catch {
    return false;
  }
}
