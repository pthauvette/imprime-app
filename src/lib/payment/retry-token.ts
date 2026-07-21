/**
 * HMAC token pour les links "retry payment" envoyés par email après
 * un payment_intent.payment_failed. Pattern identique à reviewSubmitToken
 * (Round 13 #4) : déterministe par orderId, signé avec AUTH_SECRET,
 * pas d'expiration explicite (le link reste valid tant que AUTH_SECRET
 * pas rotaté + tant que l'Order existe en status FAILED ou PENDING).
 *
 * Pourquoi pas un JWT ou un random token persistant :
 *   - HMAC = stateless, pas de table à query
 *   - Déterministe = pas de race condition entre email send et lookup
 *   - 32 chars hex = brute-force-resistant (128 bits effective)
 *
 * Round 25 #5.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { signingSecret } from '@/lib/crypto/signing-secret';

export function paymentRetryToken(orderId: string): string {
  const secret = signingSecret('lien de reprise de paiement');
  return createHmac('sha256', secret)
    .update(`payment-retry:${orderId}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Constant-time compare pour éviter les timing attacks sur le token lookup.
 */
export function verifyPaymentRetryToken(orderId: string, token: string): boolean {
  const expected = paymentRetryToken(orderId);
  // Lengths can differ if attacker passes garbage — fail-fast pre-check.
  if (expected.length !== token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(token, 'utf8'));
  } catch {
    return false;
  }
}
