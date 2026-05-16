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

const SES_CONFIGURED = !!process.env.SES_SMTP_USER;
const DEV_LINK_LOGGER = !SES_CONFIGURED;
const SES_HOST = process.env.SES_SMTP_HOST ?? 'email-smtp.ca-central-1.amazonaws.com';
const SES_FROM = process.env.SES_FROM ?? 'Imprime <noreply@imprime.co>';

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
        const { createTransport } = await import('nodemailer');
        const transport = createTransport(provider.server);
        const host = new URL(url).host;
        await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: `Ton lien de connexion Imprime`,
          text: `Clique pour te connecter à ${host} :\n${url}\n\nLe lien expire dans 24h.`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:32px;border:1px solid #e8e6e1;border-radius:12px">
                   <h1 style="font-size:20px;margin:0 0 16px">Connexion à Imprime</h1>
                   <p style="color:#555;line-height:1.5">Clique sur ce lien pour te connecter :</p>
                   <p><a href="${url}" style="display:inline-block;background:#234d3a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500">Se connecter →</a></p>
                   <p style="color:#999;font-size:13px;margin-top:24px">Le lien expire dans 24h. Si tu n'as pas demandé ça, ignore ce courriel.</p>
                 </div>`,
        });
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,
    // JWT strategy : on stash user.id dans le token à la signin, puis on
    // l'expose sur session pour Server Components / API routes.
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
