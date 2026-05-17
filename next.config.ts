import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * Workaround Amplify Hosting : les env vars de la console Amplify atteignent
 * le BUILD step mais pas toujours le RUNTIME des Server Components.
 *
 * On les forward explicitement via `env` qui inline les valeurs à `next build`
 * → elles deviennent disponibles dans process.env au runtime peu importe
 * comment Amplify gère le packaging Lambda.
 *
 * Seules les SERVER-SIDE vars vont ici. `NEXT_PUBLIC_*` sont déjà publiques
 * et inlinées par Next automatiquement.
 */
// Last forced rebuild trigger: 2026-05-17 — pickup UPSTASH_REDIS_* env vars for rate limiting
const SERVER_ENV_KEYS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_URL',
  'AUTH_TRUST_HOST',
  'ADMIN_EMAILS',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_AUTH_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SINALITE_CLIENT_ID',
  'SINALITE_CLIENT_SECRET',
  'SINALITE_API_BASE',
  'SINALITE_AUDIENCE',
  'SINALITE_AUTH_BASE',
  'SINALITE_STORE_CODE',
  'SINALITE_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SES_SMTP_USER',
  'SES_SMTP_PASS',
  'SES_SMTP_HOST',
  'SES_FROM',
  'CRON_SECRET',
  'SLACK_WEBHOOK_URL',
  // Identité légale vendeur — pour reçus TPS/TVQ
  'COMPANY_LEGAL_NAME',
  'COMPANY_ADDRESS',
  'COMPANY_GST_NUMBER',
  'COMPANY_QST_NUMBER',
] as const;

const env: Record<string, string> = {};
for (const key of SERVER_ENV_KEYS) {
  const val = process.env[key];
  if (val !== undefined) env[key] = val;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  env,
};

// Wrap avec Sentry uniquement si auth token est configuré (sinon noop).
// Le wrapper instrumente le build pour upload les sourcemaps + register
// l'instrumentation hook. À runtime, src/instrumentation.ts gate sur DSN.
const withSentry = (config: NextConfig): NextConfig =>
  process.env.SENTRY_AUTH_TOKEN
    ? withSentryConfig(config, {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        silent: true,
        sourcemaps: { disable: false },
        disableLogger: true,
      })
    : config;

export default withSentry(nextConfig);
