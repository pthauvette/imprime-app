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
import { sendWelcomeEmail } from '@/lib/emails/send';
import { logAuth } from '@/lib/logger';

const SES_CONFIGURED = !!process.env.SES_SMTP_USER;
const DEV_LINK_LOGGER = !SES_CONFIGURED;
const SES_HOST = process.env.SES_SMTP_HOST ?? 'email-smtp.ca-central-1.amazonaws.com';
const SES_FROM = process.env.SES_FROM ?? 'Plio <bonjour@plio.ca>';

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
          // Dev convenience : log the magic link to stdout. We deliberately use
          // a Pino-friendly structured payload (no fancy box drawing) so
          // CloudWatch / log shippers can still index it if it ever ships.
          logAuth.info({ email: identifier, url }, '🔑 AUTH MAGIC LINK (dev)');
          return;
        }
        // Prod : SMTP SES via nodemailer (provider.server est passé par Auth.js)
        // HTML rendu via le template designed dans Open Design.
        const { createTransport } = await import('nodemailer');
        const transport = createTransport(provider.server);
        const host = new URL(url).host;
        const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca'}/settings#email-preferences`;
        const html = renderEmail('magic-link', {
          MAGIC_LINK_URL: url,
          UNSUBSCRIBE_URL: unsubscribeUrl,
        });
        await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: `Ton lien de connexion Plio`,
          text: `Clique pour te connecter à ${host} :\n${url}\n\nLe lien expire dans 24h.`,
          html,
        });
      },
    }),
  ],

  events: {
    // À la signin :
    //   1. Synchronise le role User depuis ADMIN_EMAILS (bootstrap admin)
    //   2. Si premier sign-in détecté (createdAt récent + 0 activité) →
    //      envoie l'email de bienvenue
    async signIn({ user, isNewUser }) {
      if (!user.id || !user.email) return;

      // Step 1: admin role sync
      if (isAdminEmail(user.email)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'ADMIN' },
        }).catch(() => {/* non-fatal */});
      }

      // Step 2: welcome email (best-effort)
      // Auth.js v5 fournit isNewUser=true sur le tout premier sign-in (création user).
      // Fallback heuristique : si pas de orders ni de designs ET createdAt récent,
      // c'est probablement le premier login (sur un user créé en guest order).
      try {
        let isFirstSignIn = isNewUser === true;
        if (!isFirstSignIn) {
          const counts = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
              createdAt: true,
              _count: { select: { orders: true, designDrafts: true } },
            },
          });
          if (counts) {
            const recentlyCreated = Date.now() - counts.createdAt.getTime() < 5 * 60 * 1000;
            const noActivity = counts._count.orders === 0 && counts._count.designDrafts === 0;
            isFirstSignIn = recentlyCreated && noActivity;
          }
        }
        if (isFirstSignIn) {
          const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
          if (fullUser) {
            await sendWelcomeEmail({ user: fullUser });
          }
        }
      } catch (err) {
        logAuth.error({ err, userId: user.id }, 'welcome email failed');
      }
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
