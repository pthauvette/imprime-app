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
  '/onboarding',
  // /templates et /design sont publics — browser le catalog/éditeur sans
  // compte ; auth requise au moment de la finalisation/checkout.
];

// /admin/* exige role ADMIN — gate plus strict que juste auth.
const ADMIN_PREFIX = '/admin';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Admin gate : pathname === '/admin' OR /admin/*
  const isAdminPath = pathname === ADMIN_PREFIX || pathname.startsWith(ADMIN_PREFIX + '/');
  if (isAdminPath) {
    if (!req.auth) {
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }
    // Role check : authConfig.callbacks.authorized() returns true so we
    // verify role here. session.user.role est set par le jwt callback.
    const role = (req.auth.user as { role?: 'USER' | 'ADMIN' } | undefined)?.role;
    if (role !== 'ADMIN') {
      // Redirige vers home avec un flag (non-affiché côté UI pour MVP)
      return NextResponse.redirect(new URL('/?forbidden=admin', req.url));
    }
    return;
  }

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
