/**
 * Centralized env validation — Round 38 #5.
 *
 * Pourquoi : avant ce fichier, chaque module faisait `process.env.X ?? null`
 * et tolérait silencieusement les missing vars (CRON_SECRET undefined =
 * "Not configured" 503, mais d'autres modules fail tard avec un cryptic
 * undefined error). Audit Round 37 #5 a flag fail-late comportement.
 *
 * Maintenant : ce module est importé au boot (via instrumentation.ts).
 * Si une env critique manque en production, le process throw au start
 * → Vercel marque deploy as failed → on est notifié immédiatement.
 *
 * En dev, les missing vars sont logged warn mais le boot continue
 * (DX : on peut tourner localement sans Stripe/SES/Sinalite si on dev
 * juste sur l'UI).
 */

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database — toujours requis (sans DB, rien ne marche)
  DATABASE_URL: z.string().url().startsWith('postgres'),

  // Auth.js — requis en prod
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().optional(),

  // Stripe — requis en prod, optional en dev/test
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),

  // Sinalite — déjà validé par lib/sinalite/client.ts au runtime, on
  // dédup les vars critiques ici pour le boot check
  SINALITE_CLIENT_ID: z.string().min(1).optional(),
  SINALITE_CLIENT_SECRET: z.string().min(1).optional(),

  // SES SMTP — optional (dev log les magic links console)
  SES_SMTP_USER: z.string().optional(),
  SES_SMTP_PASS: z.string().optional(),
  // Round 42b — accepte le format "Name <email>" (ex: Plio <bonjour@plio.ca>)
  // que SES exige pour un display name, en plus d'un email pur. z.email()
  // seul rejetait "Plio <bonjour@plio.ca>" → log d'erreur bruyant au boot.
  SES_FROM: z
    .string()
    .refine(
      (v) => /^[^<>]*<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>$/.test(v) || /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(v),
      { message: 'must be an email or "Name <email>"' },
    )
    .optional(),

  // S3 (uploads)
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Cron Bearer auth — requis en prod (tous les cron routes 503 sans)
  CRON_SECRET: z.string().min(16).optional(),

  // Admin promotion — list emails comma-separated. Optional (peut être
  // promoted via DB direct).
  ADMIN_EMAILS: z.string().optional(),

  // Public URL — utilisé pour les liens absolus dans emails + sitemap
  NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),

  // Sentry — optional, instrumentation.ts gate sur DSN
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

  // Upstash Redis (rate limit) — fallback to in-memory si absent
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Slack alerts — optional, sendCriticalAlert noop si absent
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // Compagnie info (factures CRA)
  COMPANY_LEGAL_NAME: z.string().optional(),
  COMPANY_ADDRESS: z.string().optional(),
  COMPANY_GST_NUMBER: z.string().optional(),
  COMPANY_QST_NUMBER: z.string().optional(),
});

/**
 * Parse process.env. Returns the typed env object.
 * En prod, throw si critical vars manquent (STRIPE/AUTH/CRON/Sinalite).
 * En dev/test, warn + continue (DX-friendly).
 */
function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    const msg = `Env validation failed:\n${issues}`;
    // Round 42b (incident prod 2026-05-30) — NE PLUS throw ici, même en prod.
    // Avant : `throw` → ce module crashait au load → si importé au boot
    // (instrumentation.ts), tout le serveur SSR tombait → 500 sur 100% du
    // site pour UNE var manquante. C'est arrivé via un bug regex amplify.yml
    // (false positive : les vars ÉTAIENT configurées). Désormais on log
    // seulement et on retourne l'env loose : une var manquante casse la
    // feature qui l'utilise (fail-soft), pas le site entier (fail-hard).
    // assertProductionEnvReady() reste dispo pour un check explicite hors boot.
    // eslint-disable-next-line no-console
    console.error(
      `[env] ${msg}\nContinuing with partial config (features using missing vars will degrade).`,
    );
    return process.env as unknown as z.infer<typeof envSchema>;
  }
  return result.data;
}

/**
 * Validated env object. Import this instead of process.env directly
 * pour bénéficier de type safety + fail-fast en prod.
 *
 * Usage :
 *   import { env } from '@/lib/env';
 *   const dbUrl = env.DATABASE_URL; // typed string
 */
export const env = parseEnv();

/**
 * Production-only assert : appeler depuis `instrumentation.ts` au boot
 * pour fail-fast si critical vars manquent. Catch ici pour produire un
 * message clair (vs un cryptic undefined plus tard).
 */
export function assertProductionEnvReady(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const required = [
    'DATABASE_URL',
    'AUTH_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'SINALITE_CLIENT_ID',
    'SINALITE_CLIENT_SECRET',
    'CRON_SECRET',
    'SES_SMTP_USER',
    'SES_SMTP_PASS',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required production env vars: ${missing.join(', ')}\n` +
      `Check Vercel project settings or .env.production`,
    );
  }
}
