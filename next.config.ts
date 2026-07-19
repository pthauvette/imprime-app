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

/**
 * Round 36 #2 — Security response headers.
 *
 * Avant : pas de headers de sécurité explicites (Amplify peut set HSTS auto
 * mais aucune CSP/X-Frame-Options/Referrer-Policy). L'absence de CSP rend
 * le blast radius d'un XSS infinement plus grand ; l'absence de
 * X-Frame-Options expose /admin, /wallet, /payments au clickjacking.
 *
 * Stratégie :
 *   - X-Frame-Options DENY (pas iframe-able du tout, conservative)
 *   - Referrer-Policy strict-origin-when-cross-origin (default sain)
 *   - Permissions-Policy : refuse camera/mic/geo par défaut
 *   - HSTS : 2 ans + preload (override Amplify default si présent)
 *   - X-Content-Type-Options nosniff (block MIME sniffing)
 *   - CSP : Report-Only pour démarrer (collect violations, durcir progressivement)
 *     car le projet utilise du inline-style CSS partout + img Stripe + Sentry
 *
 * À l'avenir, basculer Content-Security-Policy (sans -Report-Only) une fois
 * que les violations report sont à zéro pendant 2 semaines en prod.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // CSP en Report-Only pour démarrer — collect les violations sans casser
  // les pages live (inline styles partout, Stripe Elements iframe, etc.).
  // Quand stable, on flip à "Content-Security-Policy" hard-enforce.
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.sentry.io",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.stripe.com https://*.sentry.io https://*.upstash.io",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  env,
  // OOM build Amplify (2026-07-15) : `next build` tue un worker en SIGKILL
  // (OOM CONTENEUR, pas heap Node — le bump NODE_OPTIONS n'y a rien fait).
  // L'app est au ras du plafond mémoire du compute « Standard » (4 Go) : #451
  // se déployait, #452 (simple CSS/TSX) a suffi à faire basculer. Ces deux
  // leviers réduisent l'empreinte RÉELLE du build (≠ le cap de heap) :
  //  - webpackMemoryOptimizations : mode webpack basse-mémoire (Next 15+),
  //    compile plus lentement mais avec un pic RSS nettement plus bas.
  //  - eslint au build désactivé : la CI lint déjà (gate) ; en prime le build
  //    Amplify le voyait échouer (« Cannot find @eslint/eslintrc ») en warning
  //    inutile. On économise un worker + de la mémoire.
  // ⚠️ Palliatif : le fix DURABLE reste de passer le build compute Amplify en
  //    « Large » (8 Go). L'app continuera de grossir.
  experimental: { webpackMemoryOptimizations: true },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
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
