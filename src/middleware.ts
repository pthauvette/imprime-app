/**
 * Middleware Next.js — gate les routes account-only derrière auth.
 *
 * Utilise la config edge-safe (auth.config.ts), pas le full config (auth.ts)
 * qui importe Prisma + nodemailer (incompatible avec Edge runtime).
 *
 * Routes protégées :
 *   /orders, /orders/*, /drafts, /addresses, /wallet, /payments,
 *   /settings, /referrals, /samples, /reseller, /templates
 */

import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES = [
  '/orders',
  '/drafts',
  '/addresses',
  '/wallet',
  '/payments',
  '/settings',
  '/referrals',
  '/samples',
  '/reseller',
  // /templates et /design sont publics — browser le catalog/éditeur sans
  // compte ; auth requise au moment de la finalisation/checkout.
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (!needsAuth) return;

  if (!req.auth) {
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }
});

// Exclut /api/* (avec /api/auth pour les callbacks), assets statiques, fonts.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|fonts).*)'],
};
