/**
 * Auth.js v5 — Email magic link via AWS SES (SMTP).
 *
 * En dev (sans SES_SMTP_USER), les magic links sortent en console — copier-
 * coller dans le navigateur. Aucune dépendance SMTP nécessaire en local.
 *
 * En prod (Amplify), set SES_SMTP_USER + SES_SMTP_PASS + SES_FROM. SES sandbox
 * exige des recipients vérifiés au début — request out-of-sandbox via la
 * console SES pour ouvrir à tous les domaines.
 */

import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Nodemailer from 'next-auth/providers/nodemailer';
import { prisma } from '@/lib/db';
import { authConfig } from '@/auth.config';
import { renderEmail } from '@/lib/emails/render';

const SES_CONFIGURED = !!process.env.SES_SMTP_USER;
const DEV_LINK_LOGGER = !SES_CONFIGURED;
const SES_HOST = process.env.SES_SMTP_HOST ?? 'email-smtp.ca-central-1.amazonaws.com';
const SES_FROM = process.env.SES_FROM ?? 'Imprime <noreply@imprime.co>';

// Bootstrap admin via env var — list d'emails séparés par virgule. Tout user
// qui se sign-in avec un de ces emails est promu ADMIN automatiquement.
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // JWT strategy : nécessaire pour que le middleware (Edge runtime) puisse
  // valider la session sans roundtrip Prisma. Le JWT contient juste user.id +
  // email, signé avec AUTH_SECRET. PrismaAdapter reste utilisé pour User /
  // Account / VerificationToken (création + lookup à la signin).
  session: { strategy: 'jwt' },

  providers: [
    Nodemailer({
      // Auth.js exige une `server` config — en dev on passe une fake (pas
      // utilisée car sendVerificationRequest override l'envoi).
      server: DEV_LINK_LOGGER
        ? { host: 'localhost', port: 25, auth: { user: '', pass: '' } }
        : {
            host: SES_HOST,
            port: 587,
            secure: false, // STARTTLS sur 587
            auth: {
              user: process.env.SES_SMTP_USER!,
              pass: process.env.SES_SMTP_PASS!,
            },
          },
      from: SES_FROM,

      async sendVerificationRequest({ identifier, url, provider }) {
        if (DEV_LINK_LOGGER) {
          console.log(
            '\n' +
              '═══════════════════════════════════════════════════════════════\n' +
              '  🔑 AUTH MAGIC LINK (dev)\n' +
              '  email : ' + identifier + '\n' +
              '  url   : ' + url + '\n' +
              '═══════════════════════════════════════════════════════════════\n',
          );
          return;
        }
        // Prod : SMTP SES via nodemailer (provider.server est passé par Auth.js)
        // HTML rendu via le template designed dans Open Design.
        const { createTransport } = await import('nodemailer');
        const transport = createTransport(provider.server);
        const host = new URL(url).host;
        const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://imprime.co'}/settings#email-preferences`;
        const html = renderEmail('magic-link', {
          MAGIC_LINK_URL: url,
          UNSUBSCRIBE_URL: unsubscribeUrl,
        });
        await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: `Ton lien de connexion Imprime`,
          text: `Clique pour te connecter à ${host} :\n${url}\n\nLe lien expire dans 24h.`,
          html,
        });
      },
    }),
  ],

  events: {
    // À la signin, on synchronise le role User en DB depuis ADMIN_EMAILS.
    // Idempotent : si user déjà ADMIN ou pas dans la liste, no-op.
    async signIn({ user }) {
      if (!user.id || !user.email) return;
      const shouldBeAdmin = isAdminEmail(user.email);
      if (!shouldBeAdmin) return;
      // Promote silently — éviter d'overwrite si déjà admin
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      }).catch(() => {/* user may not exist yet in some flows — non-fatal */});
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    // JWT strategy : on stash user.id + role dans le token à la signin.
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        // Lookup role from DB (PrismaAdapter user has only Auth.js base fields)
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, email: true },
        });
        // Fast-path : si email ADMIN, on hisse immédiatement même si le DB
        // sync events.signIn n'a pas encore committed (race condition)
        token.role = (dbUser?.role === 'ADMIN' || isAdminEmail(dbUser?.email ?? user.email))
          ? 'ADMIN' : 'USER';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.userId) session.user.id = token.userId as string;
        if (token.role) session.user.role = token.role as 'USER' | 'ADMIN';
      }
      return session;
    },
  },
});
