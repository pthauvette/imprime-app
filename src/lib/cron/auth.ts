/**
 * Auth Bearer partagée des cron routes — Audit v2 #7.8.
 *
 * Avant : chaque route /api/cron/* dupliquait le même bloc (≈12 lignes) avec une
 * comparaison `auth !== \`Bearer ${CRON_SECRET}\`` non-constant-time. Conséquences :
 *   - 16 copies à maintenir (un fix sécu = 16 éditions) ;
 *   - `!==` court-circuite au 1er octet différent → fuite de timing théorique.
 *
 * Ce helper centralise la logique en UN point auditable et compare en temps
 * constant : les deux chaînes sont hashées en SHA-256 (32 octets fixes) puis
 * comparées via timingSafeEqual → ni la longueur ni le contenu ne fuient via le
 * timing.
 */

import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { log } from '@/lib/logger';

/** Compare deux chaînes en temps constant (hash → longueur fixe → pas de leak). */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Vérifie le Bearer CRON_SECRET d'une requête cron.
 *
 * @returns une NextResponse d'erreur si REFUSÉ (le caller doit la retourner), ou
 *          `null` si AUTORISÉ (le caller continue). En non-prod sans secret
 *          configuré, autorise (retourne null) après un warn — comme avant.
 */
export function requireCronAuth(req: Request, cronName: string): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      log.error(`cron/${cronName}: CRON_SECRET not set in production`);
      return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    }
    log.warn(`cron/${cronName}: CRON_SECRET not set — allowing in non-prod`);
    return null;
  }
  const auth = req.headers.get('authorization') ?? '';
  if (!constantTimeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
