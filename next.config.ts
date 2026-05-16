import type { NextConfig } from 'next';

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
const SERVER_ENV_KEYS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_URL',
  'AUTH_TRUST_HOST',
  'ADMIN_EMAILS',
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

export default nextConfig;
