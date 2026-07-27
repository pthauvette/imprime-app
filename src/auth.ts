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
import { sendWelcomeEmail, unsubscribeUrlFor } from '@/lib/emails/send';
import { logAuth } from '@/lib/logger';
import { buildSignupUpdateData } from '@/lib/auth/pending-profile';

const SES_CONFIGURED = !!process.env.SES_SMTP_USER;
const DEV_LINK_LOGGER = !SES_CONFIGURED;

/**
 * Origine d'une URL, sans le chemin ni la query — donc SANS le jeton.
 * Sert à garder une info de débogage utile (« vers quel host part le lien ? »)
 * quand on censure l'URL complète du magic link. Retourne une constante si
 * l'URL est illisible, jamais l'entrée brute (qui pourrait porter le jeton).
 */
function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '(url invalide)';
  }
}
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

/** Audit admin 2026-07 §2.1 — fréquence de re-résolution du rôle depuis la DB
 *  (fenêtre max de révocation d'un accès admin). 15 min = compromis entre
 *  révocation rapide et coût Neon (1 findUnique / user / 15 min, pas / requête). */
const ROLE_REFRESH_MS = 15 * 60 * 1000;

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
          //
          // ⚠️ Audit 2026-07 (P1-4) : `email` était censuré par le redactor mais
          // PAS `url` — or l'URL EST le jeton de connexion à usage unique.
          // Le commentaire ci-dessus anticipait justement une expédition vers
          // CloudWatch : un lien magique en clair dans les logs = prise de
          // contrôle de compte pour quiconque lit les logs. On logue désormais
          // sous la clé `token` (censurée par SENSITIVE_KEYS) et on garde
          // séparément l'origine, seule partie utile au débogage.
          logAuth.info(
            { email: identifier, token: url, magicLinkOrigin: safeOrigin(url) },
            '🔑 AUTH MAGIC LINK (dev)',
          );
          return;
        }
        // Prod : SMTP SES via nodemailer (provider.server est passé par Auth.js)
        // HTML rendu via le template designed dans Open Design.
        const { createTransport } = await import('nodemailer');
        const transport = createTransport(provider.server);
        const host = new URL(url).host;
        // finding [111] — /settings est auth-gated ; le destinataire d'un
        // magic-link n'a PAS de session (c'est justement pour ça qu'il reçoit
        // ce courriel) → l'ancien lien menait à sign-in : désabonnement
        // circulaire. Même token HMAC sans-auth que les invités abandoned-cart.
        const unsubscribeUrl = unsubscribeUrlFor(identifier);
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

      // Step 1b: capture referral code from cookie (best-effort, first-write-wins).
      // Le cookie plio_ref est posé par middleware quand visitor arrive avec
      // ?ref=CODE. Si l'user existe déjà avec referredByCode, on ne touche pas.
      if (isNewUser === true) {
        try {
          const { cookies } = await import('next/headers');
          const cookieStore = await cookies();
          const refCookie = cookieStore.get('plio_ref')?.value;
          if (refCookie) {
            const normalized = refCookie.trim().toUpperCase().slice(0, 20);
            if (normalized.length >= 5) {
              await prisma.user.update({
                where: { id: user.id, referredByCode: null },
                data: { referredByCode: normalized },
              }).catch(() => {/* déjà set ou user disparu, no-op */});
            }
          }

          // Step 1c: si l'user vient de /sign-up, on a posé un cookie
          // plio_pending_profile avec firstName/lastName/companyName +
          // opt-in marketing. Cookie 15min TTL — survit le round-trip
          // magic-link. On le lit ici pour populer le User row. La logique de
          // parsing + opt-in affirmatif (Loi 25) vit dans buildSignupUpdateData
          // (testé directement — audit v3 L6).
          {
            try {
              const updateData = buildSignupUpdateData(cookieStore.get('plio_pending_profile')?.value);
              if (Object.keys(updateData).length > 0) {
                await prisma.user.update({
                  where: { id: user.id },
                  data: updateData,
                }).catch(() => {/* no-op */});
              }
            } catch {
              // ignore
            }
          }
        } catch {
          // cookies() peut throw hors d'un request context — ignore.
        }
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
          // Audit v2 #8.3 — code promo de bienvenue (« 25 $ offerts sur ta 1re
          // commande »), SEULEMENT si l'inscription vient de la page promo
          // (cookie plio_welcome posé par SignUpForm). Code promo (et non crédit
          // wallet) car il faut imposer le minimum de commande de 100 $
          // (minSubtotalCents) + 1re commande only — impossible sur un solde
          // wallet fongible. Idempotent + best-effort (n'altère pas le login).
          let welcomeCode: string | undefined;
          try {
            const { cookies } = await import('next/headers');
            const eligible = (await cookies()).get('plio_welcome')?.value === '1';
            if (eligible) {
              const { grantWelcomePromo } = await import('@/lib/promo/welcome');
              welcomeCode = await grantWelcomePromo(user.id);
              logAuth.info({ userId: user.id, code: welcomeCode }, 'welcome promo accordé');
            }
          } catch (err) {
            logAuth.error({ err, userId: user.id }, 'welcome promo failed (non-fatal)');
          }

          const fullUser = await prisma.user.findUnique({ where: { id: user.id } });
          if (fullUser) {
            // Audit v2 #7.8 — dédup du welcome email (queueEmail ne consulte pas
            // le label) : findFirst sur welcome:<userId> avant l'envoi.
            const alreadyWelcomed = await prisma.emailDelivery
              .findFirst({ where: { label: `welcome:${user.id}` }, select: { id: true } })
              .catch(() => null);
            if (!alreadyWelcomed) {
              try {
                await sendWelcomeEmail({ user: fullUser, promoCode: welcomeCode });
              } catch (err) {
                logAuth.error({ err, userId: user.id }, 'welcome email failed');
              }
            }
          }
        }
      } catch (err) {
        logAuth.error({ err, userId: user.id }, 'first sign-in handling failed');
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
        token.roleCheckedAt = Date.now();
      } else if (token.userId) {
        // Audit admin 2026-07 §2.1 — le rôle était FIGÉ dans le JWT jusqu'à
        // expiration (défaut NextAuth 30 j) : rétrograder/congédier un admin
        // n'avait aucun effet tant qu'il ne se déconnectait pas. On re-résout le
        // rôle depuis la DB au plus toutes les ROLE_REFRESH_MS → fenêtre de
        // révocation ≤ 15 min, sans payer un findUnique Neon par requête.
        const checkedAt = typeof token.roleCheckedAt === 'number' ? token.roleCheckedAt : 0;
        if (Date.now() - checkedAt > ROLE_REFRESH_MS) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.userId as string },
              select: { role: true, email: true },
            });
            // User supprimé → USER (aucun accès admin). Jamais hissé sur erreur.
            token.role = (dbUser?.role === 'ADMIN' || isAdminEmail(dbUser?.email))
              ? 'ADMIN' : 'USER';
            token.roleCheckedAt = Date.now();
          } catch (err) {
            // Blip DB (Neon froid) : on CONSERVE le rôle existant plutôt que de
            // déconnecter un admin légitime en plein incident — sans jamais hisser.
            // Le refresh sera retenté au prochain appel (roleCheckedAt inchangé).
            logAuth.error({ err }, 'jwt role refresh failed (rôle existant conservé)');
          }
        }
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
