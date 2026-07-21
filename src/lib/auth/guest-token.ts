import { randomBytes } from 'node:crypto';
import type { NextResponse } from 'next/server';

/**
 * Identité de navigateur pour les visiteurs NON connectés.
 *
 * Le problème (audit pré-lancement 2026-07, P1-5) : tous les invités partagent
 * UNE seule row `User` (`guest@plio.local`). Filtrer une mutation par `userId`
 * les cloisonne donc face aux comptes réels, mais PAS entre eux — deux invités
 * quelconques ont le même `userId`. Un invité qui obtenait le `draftId` d'un
 * autre pouvait écraser son design.
 *
 * Ce jeton est un CAPABILITY porteur : 256 bits tirés d'un CSPRNG, gardés dans
 * un cookie `httpOnly`. Pas de HMAC — on ne valide pas une donnée fournie par
 * le client, on vérifie qu'il présente une valeur qu'on a nous-mêmes émise et
 * stockée. Un attaquant devrait deviner le jeton, pas le forger.
 */
export const GUEST_COOKIE = 'plio_guest';

/** 30 j : couvre un aller-retour « je finalise, je reviens demain commander ». */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function newGuestToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Pose le cookie sur la réponse. `httpOnly` : aucun JS de page n'a à le lire —
 * le serveur seul s'en sert. `sameSite: 'lax'` : le brouillon est repris via
 * une navigation normale (lien /drafts), jamais via une requête cross-site.
 */
export function setGuestCookie(res: NextResponse, token: string): void {
  res.cookies.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}
