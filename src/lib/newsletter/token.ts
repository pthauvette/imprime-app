/**
 * HMAC token pour les links unsubscribe newsletter.
 *
 * Utilise AUTH_SECRET (déjà set pour Auth.js) comme secret HMAC. Le
 * token est déterministe par email : même email = même token pour la
 * vie de l'AUTH_SECRET. Si on rotate AUTH_SECRET, les anciens tokens
 * deviennent invalides — acceptable parce qu'on n'envoie pas de
 * campagnes avec links pré-générés > 90 jours.
 */

import { createHmac } from 'node:crypto';
import { signingSecret } from '@/lib/crypto/signing-secret';

export function newsletterUnsubscribeToken(email: string): string {
  const secret = signingSecret('desabonnement infolettre');
  return createHmac('sha256', secret)
    .update(`newsletter:${email.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}
