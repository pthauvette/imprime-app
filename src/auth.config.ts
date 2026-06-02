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
    // Round 6 #1 — sans pages.error, un lien magique expiré/déjà utilisé
    // (erreur la plus fréquente du flow) renvoyait vers la page d'erreur Auth.js
    // par défaut (générique, hors design). On route les erreurs vers /sign-in
    // qui lit ?error= et affiche une bannière mappée.
    error: '/sign-in',
  },
  // Doit matcher auth.ts pour que le middleware lise le JWT cookie correctement.
  session: { strategy: 'jwt' },
  // Amplify Hosting est derrière CloudFront — Auth.js doit faire confiance
  // aux headers x-forwarded-* sinon refuse toutes les requêtes (UntrustedHost).
  // Pareil que AUTH_TRUST_HOST=true mais en code pour éviter la dépendance env.
  trustHost: true,
  providers: [],
  callbacks: {
    // Pour le middleware uniquement : autorise tout, le check de gating
    // est fait dans middleware.ts via req.auth.
    async authorized() {
      return true;
    },
    // Le middleware lit req.auth.user.* — on doit propager les fields que
    // auth.ts set dans le JWT. Sans ça req.auth.user.role est undefined.
    // (auth.ts override ces callbacks avec la logique complète Prisma).
    async session({ session, token }) {
      if (session.user) {
        if (token.userId) session.user.id = token.userId as string;
        if (token.role) {
          (session.user as { role?: 'USER' | 'ADMIN' }).role = token.role as 'USER' | 'ADMIN';
        }
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
