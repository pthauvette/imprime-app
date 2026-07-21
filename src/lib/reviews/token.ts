/**
 * HMAC token pour les links "leave a review" envoyés par email après
 * livraison. Utilise AUTH_SECRET comme secret HMAC. Déterministe par
 * orderId — link reste valid tant que AUTH_SECRET n'est pas rotaté.
 */

import { createHmac } from 'node:crypto';
import { signingSecret } from '@/lib/crypto/signing-secret';

export function reviewSubmitToken(orderId: string): string {
  const secret = signingSecret('lien d avis client');
  return createHmac('sha256', secret)
    .update(`review:${orderId}`)
    .digest('hex')
    .slice(0, 32);
}
