/**
 * Middleware Next.js — gate les routes account-only derrière auth.
 *
 * Utilise la config edge-safe (auth.config.ts), pas le full config (auth.ts)
 * qui importe Prisma + nodemailer (incompatible avec Edge runtime).
 *
 * Routes protégées :
 *   /orders, /orders/*, /drafts, /addresses, /wallet, /payments,
 *   /settings, /referrals, /reseller, /templates
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
  '/reseller',
  '/onboarding',
  // `/templates` derrière le compte — décision produit (2026-08). L'audit
  // visuel a montré qu'elle était PUBLIQUE tout en portant le chrome de compte
  // (`Sidebar` : « Portefeuille », « Paiements », « Clés API ») : un visiteur
  // anonyme recevait le tableau de bord d'un compte qu'il n'avait pas. Deux
  // sorties possibles — chrome marketing, ou passage derrière le compte ;
  // Patrick a tranché pour la seconde, ce qui rend le chrome exact.
  //
  // ⚠️ Conséquence traitée dans le même changement : `/templates` était
  // l'entrée de PRIORITÉ LA PLUS HAUTE du sitemap (0.9). Annoncer à Google une
  // URL qui répond 307 vers la connexion est un défaut SEO en soi — elle en a
  // donc été retirée.
  '/templates',
  // `/design/[slug]` reste PUBLIC : chaque gabarit est une page d'atterrissage
  // indexée (toujours au sitemap), et l'éditeur fonctionne sans compte — seul
  // le rechargement d'un brouillon (`?draftId=`) lit la session.
];

// /admin/* exige role ADMIN — gate plus strict que juste auth.
const ADMIN_PREFIX = '/admin';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // ─── Capture referral code from ?ref=CODE ─────────────────────────────
  // Pose un cookie plio_ref (90j) qui sera lu par auth events.signIn sur
  // l'inscription du nouvel user. Pas de redirect — on continue le flow
  // normal, le cookie est juste posé en passant. Si le cookie existe déjà,
  // on ne l'écrase pas (first-touch attribution).
  const refParam = req.nextUrl.searchParams.get('ref');
  let cookieToSet: { name: string; value: string; maxAge: number } | null = null;
  if (refParam && refParam.length >= 5 && refParam.length <= 20 && !req.cookies.get('plio_ref')) {
    const normalized = refParam.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalized.length >= 5) {
      cookieToSet = { name: 'plio_ref', value: normalized, maxAge: 90 * 24 * 60 * 60 };
    }
  }

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
      // Audit admin 2026-07 §2.2 — redirect NU : le flag `?forbidden=admin`
      // révélait l'existence de la section admin (contredisait le notFound() de
      // requireAdminPage, qui la masque volontairement).
      return NextResponse.redirect(new URL('/', req.url));
    }
    return;
  }

  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (!needsAuth) {
    // Audit v2 #10.2 — route publique : on n'auth pas, MAIS si un ?ref=CODE est
    // présent il faut quand même poser le cookie « en passant » (les liens de
    // parrainage pointent vers la HOME publique `/?ref=CODE`). Avant, le `return`
    // ici court-circuitait la pose du cookie → parrainage cassé depuis la landing.
    if (cookieToSet) {
      const res = NextResponse.next();
      res.cookies.set(cookieToSet.name, cookieToSet.value, {
        maxAge: cookieToSet.maxAge,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
      return res;
    }
    return;
  }

  if (!req.auth) {
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    const res = NextResponse.redirect(signInUrl);
    if (cookieToSet) {
      res.cookies.set(cookieToSet.name, cookieToSet.value, {
        maxAge: cookieToSet.maxAge,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
    }
    return res;
  }

  // Si on doit poser le cookie ref mais qu'il n'y a pas de redirect à
  // faire, on attache le cookie à un NextResponse.next() qui continue
  // le flow normal.
  if (cookieToSet) {
    const res = NextResponse.next();
    res.cookies.set(cookieToSet.name, cookieToSet.value, {
      maxAge: cookieToSet.maxAge,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return res;
  }
});

// Exclut /api/* (avec /api/auth pour les callbacks), assets statiques, fonts.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|fonts).*)'],
};
