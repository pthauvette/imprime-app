/**
 * Sinalite webhook signature verification.
 *
 * Sinalite supporte 2 modes :
 *   1. HMAC-SHA256 du body : header `x-sinalite-signature: sha256=<hex>`
 *      — calcul fait avec `crypto.createHmac('sha256', secret)`. Mode préféré
 *      (résistant à replay du body modifié).
 *   2. Shared bearer : header contient le secret brut (legacy Sinalite).
 *      Pas un vrai HMAC du body, juste un check d'autorité de l'origine.
 *
 * Les 2 compare en temps constant via crypto.timingSafeEqual pour éviter
 * timing attacks. Exporté en lib pour être unit-testable hors route.
 */

import crypto from 'crypto';

/**
 * Compare deux strings en temps constant. Returns false si lengths
 * différentes (ne leak pas la longueur attendue).
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Vérifie la signature d'un webhook Sinalite.
 *
 * @param rawBody — texte brut du body (avant JSON parse)
 * @param header — valeur du header x-sinalite-signature (peut être null)
 * @param secret — SINALITE_WEBHOOK_SECRET env var
 * @returns true si signature valide
 */
export function verifySinaliteSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  if (header.startsWith('sha256=')) {
    const provided = header.slice(7);
    const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    return timingSafeStringEqual(provided, expected);
  }
  // Legacy shared-secret mode — header contient le secret brut.
  return timingSafeStringEqual(header, secret);
}
