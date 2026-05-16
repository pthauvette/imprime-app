/**
 * Auth.js v5 — split config (edge-safe).
 *
 * Le middleware tourne en Edge runtime, qui ne supporte pas les modules Node
 * (`stream`, `fs`, etc.) → on ne peut pas importer Prisma ni nodemailer ici.
 * On garde juste la liste vide de providers + les pages + callbacks edge-safe.
 *
 * Le full config (avec adapter Prisma + provider Nodemailer) vit dans auth.ts
 * et étend ce fichier-ci.
 *
 * Doc: https://authjs.dev/guides/edge-compatibility
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/sign-in',
    verifyRequest: '/sign-in/sent',
  },
  // Doit matcher auth.ts pour que le middleware lise le JWT cookie correctement.
  session: { strategy: 'jwt' },
  providers: [],
  callbacks: {
    // Pour le middleware uniquement : autorise tout, le check de gating
    // est fait dans middleware.ts via req.auth.
    async authorized() {
      return true;
    },
  },
} satisfies NextAuthConfig;
